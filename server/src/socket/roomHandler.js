/**
 * roomHandler.js -- Socket.io room membership events
 *
 * Responsibilities:
 *  1. Handle 'join-room'      -- add user to room, send current doc state
 *  2. Handle 'leave-room'     -- remove user, notify others
 *  3. Handle 'disconnect'     -- same as leave but automatic
 *  4. Handle 'language-change'-- persist + broadcast language selection
 *  5. Handle 'chat-message'   -- broadcast chat within a room
 *  6. Maintain in-memory presence map: roomId -> Map<socketId, userInfo>
 *
 * Redis keys used:
 *  room:{roomId}:doc      -- current document text (string)
 *  room:{roomId}:language -- current language selection (string)
 *
 * Note -- presence is in-memory (single-server only).
 * For multi-server scaling, move to Redis with a hash per room
 * and a TTL per socket entry, plus the Socket.io Redis adapter.
 */

// presence: Map<roomId, Map<socketId, { userId, username, color }>>
const presence = new Map();

const USER_COLORS = [
  '#6366F1', // indigo
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EC4899', // pink
  '#3B82F6', // blue
  '#EF4444', // red
  '#8B5CF6', // violet
  '#14B8A6', // teal
];

/**
 * Assign a colour that is not currently used by anyone in the room.
 * Falls back to cycling if all 8 colours are taken (>8 users).
 * This avoids the earlier bug where assignColor used room size as an
 * index -- which broke uniqueness after users left and rejoined.
 */
function assignColor(roomId) {
  const roomUsers = presence.get(roomId);
  if (!roomUsers || roomUsers.size === 0) return USER_COLORS[0];

  const usedColors = new Set(Array.from(roomUsers.values()).map(u => u.color));
  const free = USER_COLORS.find(c => !usedColors.has(c));
  return free || USER_COLORS[roomUsers.size % USER_COLORS.length];
}

/**
 * Get all users currently in a room as a plain array.
 */
function getRoomUsers(roomId) {
  const roomUsers = presence.get(roomId);
  if (!roomUsers) return [];
  return Array.from(roomUsers.values());
}

/**
 * Remove a socket from every room it was in.
 * Returns array of { roomId, userInfo } for notification.
 */
function removeSocketFromAllRooms(socketId) {
  const left = [];
  for (const [roomId, roomUsers] of presence.entries()) {
    if (roomUsers.has(socketId)) {
      left.push({ roomId, userInfo: roomUsers.get(socketId) });
      roomUsers.delete(socketId);
      if (roomUsers.size === 0) presence.delete(roomId);
    }
  }
  return left;
}

// ----------------------------------------------------------------
// Handler factory -- called once per socket connection
// ----------------------------------------------------------------

module.exports = function roomHandler(io, socket, redisClient) {

  // -- join-room -------------------------------------------------
  socket.on('join-room', async ({ roomId, userId, username }) => {
    if (!roomId || !userId || !username) {
      socket.emit('room-error', { message: 'roomId, userId, and username are required' });
      return;
    }

    try {
      socket.join(roomId);

      if (!presence.has(roomId)) presence.set(roomId, new Map());
      const roomUsers = presence.get(roomId);

      // Guard against duplicate join: if this socket is already in the room,
      // keep its existing colour so it does not shift on reconnect.
      const alreadyInRoom = roomUsers.has(socket.id);
      let color;
      if (alreadyInRoom) {
        color = roomUsers.get(socket.id).color;
      } else {
        color = assignColor(roomId);
      }

      roomUsers.set(socket.id, { userId, username, color, socketId: socket.id });

      const [doc, language] = await Promise.all([
        redisClient.get(`room:${roomId}:doc`),
        redisClient.get(`room:${roomId}:language`),
      ]);

      // Send current state only to the joining socket
      socket.emit('init-document', {
        doc:      doc      || '',
        language: language || 'javascript',
        users:    getRoomUsers(roomId),
        color,
      });

      // Notify everyone else only on the first join from this socket.
      if (!alreadyInRoom) {
        socket.to(roomId).emit('user-joined', {
          userId,
          username,
          color,
          socketId: socket.id,
          users:    getRoomUsers(roomId),
        });
      }

      console.log(`[Room] ${username} (${socket.id}) joined room ${roomId}`);

    } catch (err) {
      console.error('[roomHandler] join-room error:', err);
      socket.emit('room-error', { message: 'Failed to join room' });
    }
  });

  // -- leave-room ------------------------------------------------
  socket.on('leave-room', ({ roomId }) => {
    if (!roomId) return;

    const roomUsers = presence.get(roomId);
    if (!roomUsers) return;

    const userInfo = roomUsers.get(socket.id);
    roomUsers.delete(socket.id);
    if (roomUsers.size === 0) presence.delete(roomId);

    socket.leave(roomId);

    if (userInfo) {
      socket.to(roomId).emit('user-left', {
        userId:   userInfo.userId,
        username: userInfo.username,
        socketId: socket.id,
        users:    getRoomUsers(roomId),
      });
      console.log(`[Room] ${userInfo.username} left room ${roomId}`);
    }
  });

  // -- language-change -------------------------------------------
  socket.on('language-change', async ({ roomId, language }) => {
    if (!roomId || !language) return;

    try {
      await redisClient.set(`room:${roomId}:language`, language);
      socket.to(roomId).emit('language-change', { language });
    } catch (err) {
      console.error('[roomHandler] language-change error:', err);
    }
  });

  // -- chat-message ----------------------------------------------
  socket.on('chat-message', ({ roomId, text }) => {
    if (!roomId || !text || typeof text !== 'string') return;

    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;

    const userInfo = presence.get(roomId)?.get(socket.id);
    if (!userInfo) return; // sender not in room -- ignore

    io.to(roomId).emit('chat-message', {
      userId:    userInfo.userId,
      username:  userInfo.username,
      color:     userInfo.color,
      text:      trimmed,
      timestamp: Date.now(),
    });
  });

  // -- disconnect ------------------------------------------------
  socket.on('disconnect', () => {
    const leftRooms = removeSocketFromAllRooms(socket.id);

    for (const { roomId, userInfo } of leftRooms) {
      socket.to(roomId).emit('user-left', {
        userId:   userInfo.userId,
        username: userInfo.username,
        socketId: socket.id,
        users:    getRoomUsers(roomId),
      });
      console.log(`[Room] ${userInfo.username} disconnected from room ${roomId}`);
    }
  });

};
