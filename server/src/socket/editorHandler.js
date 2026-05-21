/**
 * editorHandler.js -- Real-time code sync with Operational Transformation
 *
 * Responsibilities:
 *  1. Receive 'code-change' from clients
 *  2. Serialise concurrent ops per room via an async queue (no race conditions)
 *  3. Transform incoming op against concurrent ops (OT)
 *  4. Apply transformed op to authoritative document in Redis
 *  5. Broadcast transformed op to ALL clients including sender (for convergence)
 *  6. Handle 'cursor-move', 'request-document', 'save-session'
 *
 * Redis keys:
 *  room:{roomId}:doc     -- authoritative document text
 *  room:{roomId}:language -- current language
 *
 * Operation shape (client -> server):
 *  {
 *    type:           'insert' | 'delete',
 *    position:       number,
 *    char:           string (insert only),
 *    userId:         string,
 *    clientRevision: number   -- ops the client had seen when it generated this op
 *  }
 *
 * Known limitation:
 *  opLogs and revisions are in-memory. If the server restarts, Redis still
 *  has the document but revision counters reset to 0. Clients with stale
 *  revisions will get a full resync via 'request-document'.
 *  For production, persist revisions to Redis alongside the document.
 */

const { transform, applyOperation } = require('../ot/transform');

const MAX_OP_LOG = 100;

// Map<roomId, Array<{ ...op, revision }>>
const opLogs = new Map();

// Map<roomId, number>
const revisions = new Map();

// Map<roomId, string> -- in-memory document cache
const roomDocs = new Map();

// Map<roomId, NodeJS.Timeout> -- debounce timers
const saveTimers = new Map();

/**
 * Per-room async queue.
 * Ensures code-change ops for the same room are processed one at a time,
 * preventing the race condition where two concurrent Redis GET calls both
 * read the same doc, apply separately, and the last SET wins.
 *
 * Map<roomId, Promise> -- each room has a promise chain.
 * New ops are chained onto the tail so they execute sequentially.
 */
const roomQueues = new Map();

/**
 * Enqueue an async task for a room.
 * The task runs only after all previously enqueued tasks for that room finish.
 */
function enqueue(roomId, task, onError) {
  const current = roomQueues.get(roomId) || Promise.resolve();
  const next = current.then(task).catch(err => {
    // Catch here so one failed task doesn't break the whole queue
    console.error(`[editorHandler] Queue error in room ${roomId}:`, err);
    if (onError) onError(err);
  });
  roomQueues.set(roomId, next);
  return next;
}

function getOpLog(roomId) {
  if (!opLogs.has(roomId)) opLogs.set(roomId, []);
  return opLogs.get(roomId);
}

function getRevision(roomId) {
  if (!revisions.has(roomId)) revisions.set(roomId, 0);
  return revisions.get(roomId);
}

function nextRevision(roomId) {
  const rev = getRevision(roomId) + 1;
  revisions.set(roomId, rev);
  return rev;
}

function appendToLog(roomId, op) {
  const log = getOpLog(roomId);
  log.push(op);
  if (log.length > MAX_OP_LOG) log.splice(0, log.length - MAX_OP_LOG);
}

/**
 * Check that the socket has actually joined the given room.
 * Prevents a socket from pushing ops into rooms it never joined.
 */
function isInRoom(socket, roomId) {
  return socket.rooms.has(roomId);
}

// ----------------------------------------------------------------
// Handler factory
// ----------------------------------------------------------------

module.exports = function editorHandler(io, socket, redisClient) {

  // -- code-change -----------------------------------------------
  socket.on('code-change', ({ roomId, operation }) => {
    // Synchronous validation before touching the queue
    if (!roomId || !operation) return;
    if (!isInRoom(socket, roomId)) return; // membership check
    if (!['insert', 'delete'].includes(operation.type)) return;
    if (typeof operation.position !== 'number') return;
    if (operation.type === 'insert' && typeof operation.char !== 'string') return;

    // Enqueue so ops for the same room never interleave
    enqueue(roomId, async () => {
      const log       = getOpLog(roomId);
      const clientRev = operation.clientRevision ?? 0;

      // 1. Find concurrent ops -- those the client had NOT seen yet
      // Exclude ops from the same user (socket), because the client's local state
      // already incorporated them sequentially before generating this op.
      const concurrent = log.filter(op => op.revision > clientRev && op.userId !== operation.userId);

      // 2. Transform incoming op against each concurrent op
      let transformed = { ...operation };
      for (const concurrentOp of concurrent) {
        transformed = transform(transformed, concurrentOp);
        if (!transformed) break; // became a no-op
      }

      const revision = nextRevision(roomId);

      if (transformed) {
        // 3. Fetch current doc (from memory or Redis) and apply
        if (!roomDocs.has(roomId)) {
          const fetched = (await redisClient.get(`room:${roomId}:doc`)) || '';
          roomDocs.set(roomId, fetched);
        }
        const currentDoc = roomDocs.get(roomId);
        const newDoc     = applyOperation(currentDoc, transformed);
        
        roomDocs.set(roomId, newDoc);
        const serverOp = { ...transformed, revision, userId: operation.userId };

        // 4. Debounce Redis persistence to avoid Upstash rate limits
        if (!saveTimers.has(roomId)) {
          saveTimers.set(roomId, setTimeout(() => {
            const docToSave = roomDocs.get(roomId);
            redisClient.set(`room:${roomId}:doc`, docToSave).catch(err => {
              console.error('[Redis] Failed to debounced save doc:', err);
            });
            saveTimers.delete(roomId);
          }, 1000));
        }

        // 5. Append to log
        appendToLog(roomId, serverOp);

        // 6. Broadcast transformed op to ALL clients in room including sender.
        //    The sender replaces its optimistically-applied local op with this
        //    server-confirmed version, guaranteeing convergence even if the
        //    server transformed it differently from what the client expected.
        io.to(roomId).emit('code-change', {
          operation:  serverOp,
          revision,
          fromSocket: socket.id, // client uses this to avoid double-applying its own op
        });

      } else {
        // Op was a no-op after transformation -- notify sender only
        socket.emit('op-ack', { revision });
      }
    }, () => {
      socket.emit('editor-error', { message: 'Failed to apply operation' });
    });
  });

  // -- cursor-move -----------------------------------------------
  socket.on('cursor-move', ({ roomId, position, userId, username }) => {
    if (!roomId || position == null) return;
    if (!isInRoom(socket, roomId)) return;

    socket.to(roomId).emit('cursor-move', {
      socketId: socket.id,
      userId,
      username,
      position, // { lineNumber, column }
    });
  });

  // -- request-document ------------------------------------------
  // Used for reconnection / resync after server restart or long disconnect.
  socket.on('request-document', async ({ roomId }) => {
    if (!roomId) return;
    if (!isInRoom(socket, roomId)) return;

    try {
      if (!roomDocs.has(roomId)) {
        const fetchedDoc = (await redisClient.get(`room:${roomId}:doc`)) || '';
        roomDocs.set(roomId, fetchedDoc);
      }
      const doc = roomDocs.get(roomId);
      const language = await redisClient.get(`room:${roomId}:language`);

      socket.emit('init-document', {
        doc:      doc      || '',
        language: language || 'javascript',
        revision: getRevision(roomId),
      });
    } catch (err) {
      console.error('[editorHandler] request-document error:', err);
      socket.emit('editor-error', { message: 'Failed to fetch document' });
    }
  });

  // -- save-session ----------------------------------------------
  socket.on('save-session', async ({ roomId, language }) => {
    if (!roomId) return;
    if (!isInRoom(socket, roomId)) return;

    try {
      const doc     = (await redisClient.get(`room:${roomId}:doc`)) || '';
      const Session = require('../models/Session');

      await Session.upsertSession({
        roomId,
        code: doc,
        language,
        operationCount: getRevision(roomId),
      });

      socket.emit('session-saved', { roomId, timestamp: Date.now() });
      console.log(`[Editor] Session saved for room ${roomId}`);
    } catch (err) {
      console.error('[editorHandler] save-session error:', err);
      socket.emit('editor-error', { message: 'Failed to save session' });
    }
  });

};

module.exports.getRoomDoc = function(roomId) {
  return roomDocs.get(roomId);
};
