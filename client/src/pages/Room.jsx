/**
 * Room.jsx -- Main collaborative editor page
 *
 * This is the orchestration layer. It owns:
 *  - Socket connection (via useSocket)
 *  - OT state (via useOT)
 *  - All shared state: doc, language, users, messages, output
 *  - Layout: Toolbar / Editor+Chat / Output
 *
 * Data flow:
 *  User types
 *    -> Editor.jsx calls handleLocalOp (records in pending buffer)
 *    -> Editor.jsx calls emitChange (sends op to server)
 *    -> Server transforms + broadcasts
 *    -> useSocket receives code-change -> sets externalOp state
 *    -> Editor.jsx useEffect fires on externalOp
 *       - if own op:   calls handleOpAck, skips editor apply
 *       - if remote:   calls handleRemoteOp, applies to Monaco
 *    -> Editor.jsx calls onExternalApplied -> clears externalOp
 *
 * Layout (flex column):
 *  ┌─────────────────────────────────┐
 *  │           Toolbar (48px)        │
 *  ├──────────────────────┬──────────┤
 *  │                      │          │
 *  │     Monaco Editor    │   Chat   │
 *  │                      │          │
 *  ├──────────────────────┴──────────┤
 *  │     Output panel (collapsible)  │
 *  └─────────────────────────────────┘
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate }                   from 'react-router-dom';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';

import { useSocket }  from '../hooks/useSocket';
import { useOT }      from '../hooks/useOT';

import Toolbar     from '../components/Toolbar';
import Editor      from '../components/Editor';
import Chat        from '../components/Chat';
import Output      from '../components/Output';
import { STARTER_CODE } from '../components/Editor';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

export default function Room() {
  const { roomId }  = useParams();
  const navigate    = useNavigate();

  // ── Identity (from localStorage, set on Home.jsx) ───────────
  const [userId] = useState(() => {
    try { return localStorage.getItem('userId') || 'anon-' + Date.now(); }
    catch { return 'anon-' + Date.now(); }
  });
  const [username] = useState(() => {
    try { return localStorage.getItem('username') || 'Anonymous'; }
    catch { return 'Anonymous'; }
  });

  // ── Shared state ─────────────────────────────────────────────
  const [language,    setLanguage]    = useState('javascript');
  const [users,       setUsers]       = useState([]);
  const [messages,    setMessages]    = useState([]);
  const [initialDoc,  setInitialDoc]  = useState('');
  const [documentRevision, setDocumentRevision] = useState(0);
  const externalOpQueue = useRef([]);
  const [output,      setOutput]      = useState(null);
  const [running,     setRunning]     = useState(false);
  const [showOutput,  setShowOutput]  = useState(false);
  const [opTick,      setOpTick]      = useState(0);
  const [error,       setError]       = useState(null);
  const [saveStatus,  setSaveStatus]  = useState('idle');

  // Ref to get current editor value for Run
  // Editor.jsx updates this on every change
  const editorValueRef = useRef('');

  // Ref to track latest users without causing callback recreation
  const usersRef = useRef(users);
  usersRef.current = users;

  // Ref for error toast timeout cleanup
  const errorTimerRef = useRef(null);
  const saveTimerRef = useRef(null);

  // Remote cursors: Map<socketId, {userId, username, color, position}>
  // useRef so cursor updates don't trigger full re-renders
  const remoteCursorsRef = useRef(new Map());
  const [cursorTick, setCursorTick] = useState(0); // force re-render when cursors change

  // ── OT hook ──────────────────────────────────────────────────
  const {
    handleLocalOp,
    handleRemoteOp,
    handleOpAck,
    resetRevision,
    getRevision,
  } = useOT();

  // ── Socket callbacks ─────────────────────────────────────────

  const onInitDocument = useCallback((doc, lang, users, color, revision) => {
    setInitialDoc(doc);
    setDocumentRevision(revision ?? 0);
    setLanguage(lang);
    setUsers(users || []);
    resetRevision(revision);
  }, [resetRevision]);

  const onCodeChange = useCallback((operation, revision, fromSocket) => {
    // Push to queue -- never overwrites, so fast ops are never lost
    externalOpQueue.current.push({ operation, revision, fromSocket });
    // Force a re-render so Editor.jsx useEffect fires to drain the queue
    setOpTick(t => t + 1);
  }, []);

  const onOpAck = useCallback((revision) => {
    // No-op case: server sent op-ack instead of code-change
    handleOpAck(revision);
  }, [handleOpAck]);

  const onCursorMove = useCallback((socketId, cursorUserId, cursorUsername, position) => {
    // Find this user's color from latest users list (via ref to avoid stale closure)
    const user = usersRef.current.find(u => u.socketId === socketId);
    const color = user?.color || '#6366F1';

    remoteCursorsRef.current.set(socketId, {
      userId: cursorUserId, username: cursorUsername, color, position,
    });
    // Increment tick to trigger re-render of UserCursors
    setCursorTick(t => t + 1);
  }, []);

  const onUserJoined = useCallback((userInfo, updatedUsers) => {
    setUsers(updatedUsers || []);
  }, []);

  const onUserLeft = useCallback((userId, socketId, updatedUsers) => {
    setUsers(updatedUsers || []);
    // Remove their cursor
    remoteCursorsRef.current.delete(socketId);
    setCursorTick(t => t + 1);
  }, []);

  const onChatMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const [resetSignal, setResetSignal] = useState(0);

  const onLanguageChange = useCallback((lang, code, revision) => {
    const nextCode = typeof code === 'string' ? code : (STARTER_CODE[lang] || '');
    setLanguage(lang);
    setInitialDoc(nextCode);
    setDocumentRevision(revision ?? Date.now());
    editorValueRef.current = nextCode;
    resetRevision(revision ?? 0);
  }, [resetRevision]);

  const onError = useCallback((message) => {
    setError(message);
    clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 4000);
  }, []);

  const onSessionSaved = useCallback(() => {
    setSaveStatus('saved');
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
  }, []);

  const onSaveError = useCallback((message) => {
    setSaveStatus('error');
    onError(message || 'Failed to save session');
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
  }, [onError]);

  // ── Socket hook ───────────────────────────────────────────────
  const {
    emitChange,
    emitCursor,
    emitChat,
    emitSave,
    emitLanguage,
    connected,
    socketId,
  } = useSocket({
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
    onSessionSaved,
    onSaveError,
    onError,
  });

  // ── Handle language change ────────────────────────────────────
  const handleLanguageChange = useCallback((lang) => {
    const nextCode = STARTER_CODE[lang] || '';
    setLanguage(lang);
    setInitialDoc(nextCode);
    setDocumentRevision(Date.now());
    editorValueRef.current = nextCode;
    resetRevision(0);
    setResetSignal(c => c + 1);
    emitLanguage(lang, nextCode);
  }, [emitLanguage, resetRevision]);

  // ── Handle Run ────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    const code = editorValueRef.current;
    if (!code) return;

    setRunning(true);
    setShowOutput(true);
    setOutput(null);

    try {
      const res = await fetch(`${SERVER_URL}/api/rooms/execute`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code, language }),
      });
      if (!res.ok) {
        let detail = `Server responded with ${res.status}`;
        try {
          const errBody = await res.json();
          detail = errBody.error || JSON.stringify(errBody.detail) || detail;
        } catch { /* response wasn't JSON */ }
        throw new Error(detail);
      }
      const data = await res.json();
      setOutput(data);
    } catch (err) {
      setOutput({
        stdout:         null,
        stderr:         err.message || 'Failed to connect to execution engine.',
        compile_output: null,
        exit_code:      1,
        timed_out:      false,
      });
    } finally {
      setRunning(false);
    }
  }, [language]);



  // ── Handle Save ───────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!connected) {
      onSaveError('Cannot save while disconnected');
      return;
    }
    setSaveStatus('saving');
    emitSave(language);
  }, [connected, emitSave, language, onSaveError]);

  // ── Clear externalOp after Editor handles it ──────────────────
  // (no-op now -- Editor drains the queue directly)
  const handleExternalApplied = useCallback(() => {}, []);

  // Cleanup error timer on unmount
  useEffect(() => {
    return () => {
      clearTimeout(errorTimerRef.current);
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Redirect if no username set ───────────────────────────────
  useEffect(() => {
    try {
      if (!localStorage.getItem('username')) {
        navigate('/');
      }
    } catch {
      navigate('/');
    }
  }, [navigate]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <style>{`
        .resize-handle-vertical:hover, .resize-handle-vertical[data-resize-handle-state="drag"] {
          background: rgba(99, 102, 241, 0.5) !important;
        }
        .resize-handle-horizontal:hover, .resize-handle-horizontal[data-resize-handle-state="drag"] {
          background: rgba(99, 102, 241, 0.5) !important;
        }
      `}</style>
      
      {/* Error toast */}
      {error && (
        <div style={styles.errorToast}>
          ⚠ {error}
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        language={language}
        onLanguage={handleLanguageChange}
        onRun={handleRun}
        onSave={handleSave}
        roomId={roomId}
        users={users}
        connected={connected}
        running={running}
        saveStatus={saveStatus}
      />

      {/* Main area */}
      <div style={styles.main}>
        <PanelGroup orientation="vertical">
          <Panel defaultSize={showOutput ? 70 : 100} minSize={20}>
            <PanelGroup orientation="horizontal">
              <Panel defaultSize={75} minSize={30}>
                <div style={styles.editorPane}>
                  <Editor
                    language={language}
                    socketId={socketId}
                    remoteCursors={remoteCursorsRef.current}
                    cursorTick={cursorTick}
                    emitChange={emitChange}
                    emitCursor={emitCursor}
                    handleLocalOp={handleLocalOp}
                    handleRemoteOp={handleRemoteOp}
                    handleOpAck={handleOpAck}
                    externalOpQueue={externalOpQueue}
                    opTick={opTick}
                    onExternalApplied={handleExternalApplied}
                    initialDoc={initialDoc}
                    documentRevision={documentRevision}
                    resetSignal={resetSignal}
                    canEdit={connected}
                    onValueChange={(val) => { editorValueRef.current = val; }}
                  />
                </div>
              </Panel>
              
              <PanelResizeHandle className="resize-handle-vertical" style={styles.resizeHandleVertical} />
              
              <Panel defaultSize={25} minSize={15}>
                <div style={styles.chatPane}>
                  <Chat
                    messages={messages}
                    onSend={emitChat}
                    currentUserId={userId}
                    users={users}
                  />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          {showOutput && (
            <>
              <PanelResizeHandle className="resize-handle-horizontal" style={styles.resizeHandleHorizontal} />
              <Panel defaultSize={30} minSize={10}>
                <div style={styles.outputPane}>
                  <Output
                    result={output}
                    running={running}
                    onClose={() => setShowOutput(false)}
                  />
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Styles
// ----------------------------------------------------------------

const styles = {
  page: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100vh',
    background:    '#0F172A',
    overflow:      'hidden',
  },
  main: {
    display:  'flex',
    flex:     1,
    overflow: 'hidden',
  },
  editorPane: {
    width:    '100%',
    height:   '100%',
    position: 'relative',
  },
  chatPane: {
    width:     '100%',
    height:    '100%',
    overflow:  'hidden',
  },
  outputPane: {
    width:     '100%',
    height:    '100%',
    overflow:  'hidden',
  },
  resizeHandleVertical: {
    width:      '4px',
    cursor:     'col-resize',
    background: 'rgba(255, 255, 255, 0.05)',
    transition: 'background 0.2s',
  },
  resizeHandleHorizontal: {
    height:     '4px',
    cursor:     'row-resize',
    background: 'rgba(255, 255, 255, 0.05)',
    transition: 'background 0.2s',
  },
  errorToast: {
    position:     'fixed',
    top:          '16px',
    left:         '50%',
    transform:    'translateX(-50%)',
    background:   '#EF4444',
    color:        '#fff',
    padding:      '8px 20px',
    borderRadius: '8px',
    fontSize:     '13px',
    fontWeight:   500,
    zIndex:       1000,
    boxShadow:    '0 4px 12px rgba(0,0,0,0.3)',
  },
};
