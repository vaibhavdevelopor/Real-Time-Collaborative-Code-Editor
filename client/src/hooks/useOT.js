/**
 * useOT.js -- Client-side Operational Transformation state manager
 *
 * Responsibilities:
 *  1. Track local revision counter (how many server ops we have seen)
 *  2. Buffer outgoing ops sent but not yet acknowledged
 *  3. On incoming remote op: transform against pending local ops
 *  4. On own op confirmed (fromSocket === socketId): ack and update revision
 *  5. On op-ack (no-op case): update revision, clear buffer entry
 *  6. On init-document resync: reset all state
 *
 * Ack flow clarification:
 *  The server broadcasts ALL ops (including sender's own) via io.to(roomId).
 *  Successful ops arrive as 'code-change' with fromSocket set.
 *  No-ops arrive as 'op-ack' (server skipped the broadcast).
 *  So:
 *    - Sender receives own op back as code-change (fromSocket === socketId)
 *      -> call handleOpAck, do NOT re-apply to editor
 *    - Other users receive it as code-change (fromSocket !== socketId)
 *      -> call handleRemoteOp, apply result to editor
 *    - No-op case: sender receives op-ack only
 *      -> call handleOpAck, nothing to apply
 *
 * Usage:
 *  const { handleLocalOp, handleRemoteOp, handleOpAck, resetRevision, getRevision } = useOT();
 */

import { useRef, useCallback } from 'react';
import { transform } from '../ot/transform'; // ESM import -- see client/src/ot/transform.js

export function useOT() {
  // Current revision -- how many server-confirmed ops we have seen.
  // Ref not state: changing revision must NOT trigger re-renders.
  const revisionRef = useRef(0);

  // Buffer of sent-but-unacked ops. Oldest first.
  // Each entry: { operation, clientRevision }
  const pendingRef = useRef([]);

  // ----------------------------------------------------------------
  // handleLocalOp
  // Call BEFORE emitting an op to the server.
  // Records op in pending buffer, returns clientRevision to attach.
  // ----------------------------------------------------------------

  const handleLocalOp = useCallback((operation) => {
    const clientRevision = revisionRef.current;
    pendingRef.current.push({ operation, clientRevision });
    return clientRevision;
  }, []);

  // ----------------------------------------------------------------
  // handleRemoteOp
  // Call when a code-change arrives from ANOTHER user (fromSocket !== socketId).
  // Returns the transformed op to apply to the editor, or null for no-op.
  //
  // Double transform:
  //  - Remote op is transformed against each pending local op
  //    (adjusts remote positions for local changes server hasn't seen yet)
  //  - Each pending op is transformed against the original remote op
  //    (keeps pending buffer valid for future incoming ops)
  // ----------------------------------------------------------------

  const handleRemoteOp = useCallback((operation, revision) => {
    revisionRef.current = Math.max(revisionRef.current, revision);

    if (pendingRef.current.length === 0) return operation;

    let transformedRemote = operation;
    const newPending = [];

    for (const pending of pendingRef.current) {
      if (!transformedRemote) break;

      const newRemote    = transform(transformedRemote, pending.operation);
      const newPendingOp = transform(pending.operation, transformedRemote);

      transformedRemote = newRemote;

      if (newPendingOp) {
        newPending.push({ ...pending, operation: newPendingOp });
      }
      // null newPendingOp means that pending op is now a no-op -- drop it
    }

    pendingRef.current = newPending;
    return transformedRemote;
  }, []);

  // ----------------------------------------------------------------
  // handleOpAck
  // Call when:
  //  (a) Sender receives own op back as code-change (fromSocket === socketId)
  //  (b) Sender receives op-ack (no-op case)
  // Updates revision and removes oldest pending op from buffer.
  // ----------------------------------------------------------------

  const handleOpAck = useCallback((revision) => {
    revisionRef.current = Math.max(revisionRef.current, revision);
    if (pendingRef.current.length > 0) {
      pendingRef.current.shift(); // remove oldest pending op (FIFO)
    }
  }, []);

  // ----------------------------------------------------------------
  // resetRevision
  // Call on init-document (full resync).
  // Clears pending buffer -- unacked ops are stale after a full resync.
  // ----------------------------------------------------------------

  const resetRevision = useCallback((revision = 0) => {
    revisionRef.current = revision;
    pendingRef.current  = [];
  }, []);

  // ----------------------------------------------------------------
  // getRevision
  // Read current revision without causing a re-render.
  // ----------------------------------------------------------------

  const getRevision = useCallback(() => revisionRef.current, []);

  return {
    handleLocalOp,
    handleRemoteOp,
    handleOpAck,
    resetRevision,
    getRevision,
  };
}