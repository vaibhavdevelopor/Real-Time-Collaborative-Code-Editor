/**
 * Toolbar.jsx -- Editor toolbar
 *
 * Contains:
 *  - Language dropdown (changes syntax highlighting + execution language)
 *  - Run button (executes code via POST /api/rooms/execute)
 *  - Save button (emits save-session via socket)
 *  - Copy Link button (copies room URL to clipboard)
 *  - Connection indicator (green/red dot)
 *  - User presence avatars (coloured initials)
 *
 * Props:
 *  language      string    -- current language
 *  onLanguage    fn        -- called with new language string
 *  onRun         fn        -- called when Run is clicked
 *  onSave        fn        -- called when Save is clicked
 *  roomId        string    -- for copy link
 *  users         array     -- [{userId, username, color}]
 *  connected     boolean   -- socket connection status
 *  running       boolean   -- true while code is executing
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// Keep in sync with Session.js enum and rooms.js PISTON_LANGUAGES
const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python',     label: 'Python'     },
  { value: 'cpp',        label: 'C++'        },
  { value: 'java',       label: 'Java'       },
  { value: 'go',         label: 'Go'         },
  { value: 'rust',       label: 'Rust'       },
];

export default function Toolbar({
  language   = 'javascript',
  onLanguage,
  onRun,
  onSave,
  roomId,
  users      = [],
  connected  = false,
  running    = false,
}) {
  const [copied, setCopied] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const copiedTimer = useRef(null);
  const savedTimer  = useRef(null);

  // Clear timers on unmount to avoid setState on unmounted component
  useEffect(() => {
    return () => {
      clearTimeout(copiedTimer.current);
      clearTimeout(savedTimer.current);
    };
  }, []);

  // -- Copy room link --------------------------------------------
  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard access denied (non-HTTPS, iframe, or permission denied)
      console.warn('Clipboard write failed — falling back to prompt');
      window.prompt('Copy this link:', url);
    });
  }, [roomId]);

  // -- Save with feedback ----------------------------------------
  const handleSave = useCallback(() => {
    onSave?.();
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }, [onSave]);

  return (
    <div style={styles.toolbar}>

      {/* Left section -- language + connection */}
      <div style={styles.left}>

        {/* Connection indicator */}
        <div style={styles.indicator} title={connected ? 'Connected' : 'Disconnected'}>
          <div style={{
            ...styles.dot,
            background: connected ? '#10B981' : '#EF4444',
            boxShadow:  connected ? '0 0 6px #10B981' : 'none',
          }} />
          <span style={styles.indicatorLabel}>
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>

        {/* Language selector */}
        <select
          value={language}
          onChange={e => onLanguage?.(e.target.value)}
          style={styles.select}
          title="Select language"
        >
          {LANGUAGES.map(lang => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Centre section -- room id chip */}
      <div style={styles.centre}>
        <span style={styles.roomChip} title="Room ID">
          {roomId ? `# ${roomId.slice(0, 8)}` : '...'}
        </span>
      </div>

      {/* Right section -- actions + avatars */}
      <div style={styles.right}>

        {/* User presence avatars */}
        <div style={styles.avatars}>
          {users.slice(0, 6).map((user, index) => (
            <div
              key={user.userId || `user-${index}`}
              title={user.username}
              style={{
                ...styles.avatar,
                background:  user.color || '#6366F1',
                marginLeft:  '-6px',
              }}
            >
              {user.username?.[0]?.toUpperCase() || '?'}
            </div>
          ))}
          {users.length > 6 && (
            <div style={{ ...styles.avatar, background: '#475569', marginLeft: '-6px' }}>
              +{users.length - 6}
            </div>
          )}
        </div>

        {/* Copy link */}
        <button
          onClick={handleCopyLink}
          style={{ ...styles.btn, ...styles.btnGhost }}
          title="Copy room link"
        >
          {copied ? '✓ Copied' : '⎘ Copy Link'}
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          style={{ ...styles.btn, ...styles.btnGhost }}
          title="Save session"
        >
          {saved ? '✓ Saved' : '↓ Save'}
        </button>

        {/* Run */}
        <button
          onClick={() => onRun?.()}
          disabled={running}
          style={{
            ...styles.btn,
            ...styles.btnRun,
            opacity: running ? 0.7 : 1,
            cursor:  running ? 'not-allowed' : 'pointer',
          }}
          title="Run code"
        >
          {running ? '⏳ Running...' : '▶ Run'}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Styles -- inline for zero CSS file dependencies
// ----------------------------------------------------------------

const styles = {
  toolbar: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    height:          '48px',
    padding:         '0 16px',
    background:      '#1E293B',
    borderBottom:    '1px solid #334155',
    userSelect:      'none',
    flexShrink:      0,
  },
  left: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
    flex:       1,
  },
  centre: {
    display:    'flex',
    alignItems: 'center',
    flex:       1,
    justifyContent: 'center',
  },
  right: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    flex:       1,
    justifyContent: 'flex-end',
  },
  indicator: {
    display:    'flex',
    alignItems: 'center',
    gap:        '5px',
  },
  dot: {
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
    transition:   'background 0.3s',
  },
  indicatorLabel: {
    fontSize:   '12px',
    color:      '#94A3B8',
    fontFamily: 'monospace',
  },
  select: {
    background:   '#0F172A',
    color:        '#E2E8F0',
    border:       '1px solid #334155',
    borderRadius: '6px',
    padding:      '4px 8px',
    fontSize:     '13px',
    cursor:       'pointer',
    outline:      'none',
  },
  roomChip: {
    background:   '#0F172A',
    color:        '#64748B',
    border:       '1px solid #334155',
    borderRadius: '6px',
    padding:      '3px 10px',
    fontSize:     '12px',
    fontFamily:   'monospace',
    letterSpacing:'0.05em',
  },
  avatars: {
    display:    'flex',
    alignItems: 'center',
    marginRight:'4px',
  },
  avatar: {
    width:        '28px',
    height:       '28px',
    borderRadius: '50%',
    display:      'flex',
    alignItems:   'center',
    justifyContent:'center',
    fontSize:     '12px',
    fontWeight:   700,
    color:        '#fff',
    border:       '2px solid #1E293B',
    cursor:       'default',
  },
  btn: {
    padding:      '5px 12px',
    borderRadius: '6px',
    border:       'none',
    fontSize:     '13px',
    fontWeight:   500,
    cursor:       'pointer',
    transition:   'opacity 0.15s',
    whiteSpace:   'nowrap',
  },
  btnGhost: {
    background: '#0F172A',
    color:      '#94A3B8',
    border:     '1px solid #334155',
  },
  btnRun: {
    background: '#6366F1',
    color:      '#fff',
    fontWeight: 600,
  },
};