/**
 * Home.jsx -- Landing page
 *
 * Two actions:
 *  1. New Room  -- generates UUID v4, navigates to /room/:id
 *  2. Join Room -- accepts a room ID or full URL, navigates to /room/:id
 *
 * Username is stored in localStorage so it persists across sessions.
 * userId is also stored in localStorage (generated once per browser).
 *
 * No backend call needed to create a room -- rooms are created
 * implicitly on first join in roomHandler.js.
 */

import { useState, useCallback } from 'react';
import { useNavigate }           from 'react-router-dom';

// UUID v4 generator -- use native API when available, fallback for older browsers
function uuidv4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Valid room ID pattern: alphanumeric and hyphens, 1-64 chars
const ROOM_ID_RE = /^[a-zA-Z0-9-]{1,64}$/;

// Extract roomId from either a plain UUID or a full URL
function extractRoomId(input) {
  const trimmed = input.trim();
  // Full URL: https://example.com/room/abc-123
  const urlMatch = trimmed.match(/\/room\/([a-zA-Z0-9-]+)/);
  if (urlMatch) return urlMatch[1];
  // Plain ID -- validate format
  if (ROOM_ID_RE.test(trimmed)) return trimmed;
  return null;
}

export default function Home() {
  const navigate = useNavigate();

  const [username,   setUsername]   = useState(
    () => {
      try { return localStorage.getItem('username') || ''; }
      catch { return ''; }
    }
  );
  const [joinInput,  setJoinInput]  = useState('');
  const [usernameErr,setUsernameErr] = useState('');
  const [joinErr,    setJoinErr]     = useState('');

  // Validate and persist username
  const validateUsername = useCallback(() => {
    const name = username.trim();
    if (!name) {
      setUsernameErr('Please enter a username');
      return null;
    }
    if (name.length < 2) {
      setUsernameErr('Username must be at least 2 characters');
      return null;
    }
    if (name.length > 30) {
      setUsernameErr('Username must be 30 characters or fewer');
      return null;
    }
    setUsernameErr('');

    try {
      localStorage.setItem('username', name);
      // Ensure userId exists in localStorage
      if (!localStorage.getItem('userId')) {
        localStorage.setItem('userId', uuidv4());
      }
    } catch {
      // localStorage unavailable (private mode, quota exceeded) -- continue anyway
    }

    return name;
  }, [username]);

  // Create a new room
  const handleNewRoom = useCallback(() => {
    const name = validateUsername();
    if (!name) return;
    const roomId = uuidv4();
    navigate(`/room/${roomId}`);
  }, [validateUsername, navigate]);

  // Join an existing room
  const handleJoinRoom = useCallback(() => {
    const name = validateUsername();
    if (!name) return;

    const roomId = extractRoomId(joinInput);
    if (!roomId) {
      setJoinErr('Please enter a valid room ID or link');
      return;
    }
    setJoinErr('');
    navigate(`/room/${roomId}`);
  }, [validateUsername, joinInput, navigate]);

  const handleJoinKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleJoinRoom();
  }, [handleJoinRoom]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo + title */}
        <div style={styles.header}>
          <div style={styles.logo}>{'</>'}</div>
          <h1 style={styles.title}>MAXHEAP</h1>
          <p style={styles.subtitle}>
            Real-time collaborative code editor
          </p>
        </div>

        {/* Feature pills */}
        <div style={styles.pills}>
          {['Live cursors', 'OT sync', 'Code execution', 'Multi-language'].map(f => (
            <span key={f} style={styles.pill}>{f}</span>
          ))}
        </div>

        <div style={styles.divider} />

        {/* Username input */}
        <div style={styles.field}>
          <label style={styles.label}>Your name</label>
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setUsernameErr(''); }}
            onKeyDown={e => e.key === 'Enter' && handleNewRoom()}
            placeholder="Enter your username"
            maxLength={30}
            style={{
              ...styles.input,
              borderColor: usernameErr ? '#EF4444' : '#1E293B',
            }}
            autoFocus
          />
          {usernameErr && <span style={styles.error}>{usernameErr}</span>}
        </div>

        {/* New room button */}
        <button onClick={handleNewRoom} style={styles.primaryBtn}>
          + New Room
        </button>

        <div style={styles.orDivider}>
          <div style={styles.orLine} />
          <span style={styles.orText}>or join existing</span>
          <div style={styles.orLine} />
        </div>

        {/* Join room input */}
        <div style={styles.field}>
          <label style={styles.label}>Room ID or link</label>
          <div style={styles.joinRow}>
            <input
              value={joinInput}
              onChange={e => { setJoinInput(e.target.value); setJoinErr(''); }}
              onKeyDown={handleJoinKeyDown}
              placeholder="Paste room ID or link"
              style={{
                ...styles.input,
                flex:        1,
                borderColor: joinErr ? '#EF4444' : '#1E293B',
              }}
            />
            <button onClick={handleJoinRoom} style={styles.joinBtn}>
              Join
            </button>
          </div>
          {joinErr && <span style={styles.error}>{joinErr}</span>}
        </div>

        {/* Footer */}
        <p style={styles.footer}>
          No account required. Rooms are created instantly.
        </p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Styles
// ----------------------------------------------------------------

const styles = {
  page: {
    minHeight:      '100vh',
    background:     '#0F172A',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '20px',
  },
  card: {
    background:   '#1E293B',
    border:       '1px solid #334155',
    borderRadius: '16px',
    padding:      '40px',
    width:        '100%',
    maxWidth:     '420px',
    display:      'flex',
    flexDirection:'column',
    gap:          '16px',
  },
  header: {
    display:   'flex',
    flexDirection:'column',
    alignItems:'center',
    gap:       '6px',
  },
  logo: {
    fontSize:   '32px',
    color:      '#6366F1',
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  title: {
    margin:     0,
    fontSize:   '24px',
    fontWeight: 700,
    color:      '#E2E8F0',
    fontFamily: 'monospace',
    letterSpacing:'0.1em',
  },
  subtitle: {
    margin:   0,
    fontSize: '13px',
    color:    '#64748B',
  },
  pills: {
    display:        'flex',
    flexWrap:       'wrap',
    gap:            '6px',
    justifyContent: 'center',
  },
  pill: {
    background:   '#0F172A',
    border:       '1px solid #334155',
    borderRadius: '20px',
    padding:      '3px 10px',
    fontSize:     '11px',
    color:        '#94A3B8',
    fontFamily:   'monospace',
  },
  divider: {
    height:     '1px',
    background: '#334155',
    margin:     '4px 0',
  },
  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '6px',
  },
  label: {
    fontSize:   '12px',
    fontWeight: 600,
    color:      '#94A3B8',
    textTransform:'uppercase',
    letterSpacing:'0.06em',
  },
  input: {
    background:   '#0F172A',
    border:       '1px solid #1E293B',
    borderRadius: '8px',
    padding:      '10px 14px',
    color:        '#E2E8F0',
    fontSize:     '14px',
    outline:      'none',
    transition:   'border-color 0.15s',
  },
  error: {
    fontSize: '12px',
    color:    '#EF4444',
  },
  primaryBtn: {
    background:   '#6366F1',
    border:       'none',
    borderRadius: '8px',
    padding:      '12px',
    color:        '#fff',
    fontSize:     '15px',
    fontWeight:   600,
    cursor:       'pointer',
    transition:   'opacity 0.15s',
  },
  orDivider: {
    display:    'flex',
    alignItems: 'center',
    gap:        '10px',
  },
  orLine: {
    flex:       1,
    height:     '1px',
    background: '#334155',
  },
  orText: {
    fontSize: '12px',
    color:    '#475569',
    whiteSpace:'nowrap',
  },
  joinRow: {
    display: 'flex',
    gap:     '8px',
  },
  joinBtn: {
    background:   '#334155',
    border:       'none',
    borderRadius: '8px',
    padding:      '10px 18px',
    color:        '#E2E8F0',
    fontSize:     '14px',
    fontWeight:   600,
    cursor:       'pointer',
    whiteSpace:   'nowrap',
  },
  footer: {
    margin:    0,
    fontSize:  '12px',
    color:     '#334155',
    textAlign: 'center',
  },
};