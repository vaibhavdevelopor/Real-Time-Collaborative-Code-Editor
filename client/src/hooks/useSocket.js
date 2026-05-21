/**
 * useSocket.js -- Socket.io connection manager
 *
 * Custom React hook that manages the entire Socket.io lifecycle:
 *  1. Connect to server on mount
 *  2. Join the room
 *  3. Set up all event listeners
 *  4. Expose emit functions for the editor to call
 *  5. Disconnect cleanly on unmount
 *
 * Usage in Room.jsx:
 *  const {
 *    emitChange,       -- call when user types
 *    emitCursor,       -- call when cursor moves
 *    emitChat,         -- call when user sends a message
 *    emitSave,         -- call when user clicks Save
 *    emitLanguage,     -- call when user changes language
 *    connected,        -- boolean: is socket connected?
 *    socketId,         -- this socket's id (used to filter own ops)
 *  } = useSocket({ roomId, userId, username, ...callbacks });
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

export function useSocket({
  roomId,
  userId,
  username,
  onCodeChange,
  onCursorMove,
  onUserJoined,
  onUserLeft,
  onInitDocument,
  onChatMessage,
  onLanguageChange,
  onOpAck,
  onError,
}) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId]   = useState(null);

  // Store callbacks in a ref so listeners never go stale
  // without needing to re-register on every render.
  const cbRef = useRef({});
  useEffect(() => {
    cbRef.current = {
      onCodeChange,
      onCursorMove,
      onUserJoined,
      onUserLeft,
      onInitDocument,
      onChatMessage,
      onLanguageChange,
      onOpAck,
      onError,
    };
  });

  useEffect(() => {
    if (!roomId || !userId || !username) return;

    // -- Connect -----------------------------------------------
    const socket = io(SERVER_URL, {
      transports:           ['websocket'],
      reconnection:         true,
      reconnectionDelay:    1000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    // -- Connection lifecycle ----------------------------------
    socket.on('connect', () => {
      setConnected(true);
      setSocketId(socket.id);
      socket.emit('join-room', { roomId, userId, username });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Socket.io v4: reconnect lives on socket.io (the Manager), not socket.
    // Store the handler in a variable so cleanup removes only THIS listener,
    // not all reconnect listeners on the manager.
    const handleReconnect = () => {
      socket.emit('request-document', { roomId });
    };
    socket.io.on('reconnect', handleReconnect);

    // -- Editor events ----------------------------------------
    socket.on('code-change', ({ operation, revision, fromSocket }) => {
      cbRef.current.onCodeChange?.(operation, revision, fromSocket);
    });

    socket.on('op-ack', ({ revision }) => {
      cbRef.current.onOpAck?.(revision);
    });

    socket.on('cursor-move', ({ socketId, userId, username, position }) => {
      cbRef.current.onCursorMove?.(socketId, userId, username, position);
    });

    // -- Room events ------------------------------------------
    socket.on('init-document', ({ doc, language, users, color, revision }) => {
      // revision may be undefined on first join (roomHandler does not send it).
      // editorHandler's request-document response does include it.
      // Default to 0 -- useOT treats this as "start fresh".
      cbRef.current.onInitDocument?.(doc, language, users, color, revision ?? 0);
    });

    socket.on('user-joined', ({ userId, username, color, socketId, users }) => {
      cbRef.current.onUserJoined?.({ userId, username, color, socketId }, users);
    });

    socket.on('user-left', ({ userId, username, socketId, users }) => {
      cbRef.current.onUserLeft?.(userId, socketId, users);
    });

    socket.on('language-change', ({ language }) => {
      cbRef.current.onLanguageChange?.(language);
    });

    // -- Chat events ------------------------------------------
    socket.on('chat-message', (message) => {
      cbRef.current.onChatMessage?.(message);
    });

    // -- Save events ------------------------------------------
    socket.on('session-saved', ({ roomId, timestamp }) => {
      console.log(`[Socket] Session saved for room ${roomId} at ${timestamp}`);
    });

    // -- Error events -----------------------------------------
    socket.on('room-error',   ({ message }) => cbRef.current.onError?.(message));
    socket.on('editor-error', ({ message }) => cbRef.current.onError?.(message));

    // -- Cleanup on unmount -----------------------------------
    return () => {
      // Remove only our specific reconnect handler, not all manager listeners
      socket.io.off('reconnect', handleReconnect);
      socket.emit('leave-room', { roomId });
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setSocketId(null);
    };
  }, [roomId, userId, username]);

  // -- Emit helpers (stable references) ----------------------

  const emitChange = useCallback((operation, clientRevision) => {
    socketRef.current?.emit('code-change', {
      roomId,
      operation: { ...operation, clientRevision },
    });
  }, [roomId]);

  const emitCursor = useCallback((position) => {
    socketRef.current?.emit('cursor-move', { roomId, userId, username, position });
  }, [roomId, userId, username]);

  const emitChat = useCallback((text) => {
    socketRef.current?.emit('chat-message', { roomId, text });
  }, [roomId]);

  const emitSave = useCallback((language) => {
    socketRef.current?.emit('save-session', { roomId, language });
  }, [roomId]);

  const emitLanguage = useCallback((language) => {
    socketRef.current?.emit('language-change', { roomId, language });
  }, [roomId]);

  return {
    emitChange,
    emitCursor,
    emitChat,
    emitSave,
    emitLanguage,
    connected,
    socketId,
  };
}