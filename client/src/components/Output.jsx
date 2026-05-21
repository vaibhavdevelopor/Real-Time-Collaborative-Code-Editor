/**
 * Output.jsx -- Code execution output panel
 *
 * Displays the result of running code via POST /api/rooms/execute.
 * Three tabs: Output (stdout), Errors (stderr), Compile (compile_output).
 * Shows execution metadata: language, version, exit code, time, timed_out.
 *
 * Props:
 *  result   object | null  -- execution result from rooms.js /execute endpoint
 *  {
 *    stdout:         string | null
 *    stderr:         string | null
 *    compile_output: string | null
 *    exit_code:      number | null
 *    language:       string
 *    version:        string
 *    timed_out:      boolean
 *  }
 *  running  boolean         -- true while request is in flight
 *  onClose  fn              -- called when user closes the panel
 */

import { useState, useEffect } from 'react';

const TABS = [
  { id: 'output',  label: 'Output'  },
  { id: 'errors',  label: 'Errors'  },
  { id: 'compile', label: 'Compile' },
];

export default function Output({ result, running, onClose }) {
  const [activeTab, setActiveTab] = useState('output');

  // Inject spinner keyframe style on first render (lazy, not at module load)
  useEffect(() => {
    injectSpinnerStyle();
  }, []);

  // Auto-switch tab when a NEW result arrives; user can freely re-click afterwards
  useEffect(() => {
    if (!result) return;
    if (!result.stdout && result.stderr) {
      setActiveTab('errors');
    } else if (!result.stdout && result.compile_output) {
      setActiveTab('compile');
    } else {
      setActiveTab('output');
    }
  }, [result]);

  const getTabContent = () => {
    if (!result) return null;
    switch (activeTab) {
      case 'output':  return result.stdout         || null;
      case 'errors':  return result.stderr         || null;
      case 'compile': return result.compile_output || null;
      default:        return null;
    }
  };

  const content    = getTabContent();
  const isSuccess  = result && result.exit_code === 0 && !result.timed_out;
  const isError    = result && ((result.exit_code != null && result.exit_code !== 0) || result.timed_out);

  // Badge counts for tabs
  const hasErrors  = result?.stderr         && result.stderr.trim().length  > 0;
  const hasCompile = result?.compile_output && result.compile_output.trim().length > 0;

  return (
    <div style={styles.panel}>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>Output</span>

          {/* Status badge */}
          {running && (
            <span style={{ ...styles.badge, background: '#F59E0B' }}>
              Running...
            </span>
          )}
          {!running && result && (
            <span style={{
              ...styles.badge,
              background: result.timed_out ? '#F59E0B'
                        : isSuccess       ? '#10B981'
                        :                   '#EF4444',
            }}>
              {result.timed_out ? 'Timed Out'
               : isSuccess      ? `Exit 0`
               :                  `Exit ${result.exit_code}`}
            </span>
          )}

          {/* Language + version chip */}
          {result && (
            <span style={styles.langChip}>
              {result.language} {result.version}
            </span>
          )}
        </div>

        {/* Close button */}
        <button onClick={() => onClose?.()} style={styles.closeBtn} title="Close output panel">
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {TABS.map(tab => {
          const hasBadge = (tab.id === 'errors' && hasErrors)
                        || (tab.id === 'compile' && hasCompile);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {}),
              }}
            >
              {tab.label}
              {hasBadge && (
                <span style={styles.tabBadge}>!</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Loading state */}
        {running && (
          <div style={styles.placeholder}>
            <div style={styles.spinner} />
            <span style={{ color: '#64748B', fontSize: '13px' }}>
              Executing code...
            </span>
          </div>
        )}

        {/* Empty state */}
        {!running && !result && (
          <div style={styles.placeholder}>
            <span style={{ color: '#64748B', fontSize: '13px' }}>
              Press <kbd style={styles.kbd}>▶ Run</kbd> to execute your code
            </span>
          </div>
        )}

        {/* Timed out warning */}
        {!running && result?.timed_out && (
          <div style={{ ...styles.outputText, color: '#F59E0B', marginBottom: '8px' }}>
            ⚠ Program exceeded time limit (5 seconds) and was terminated.
          </div>
        )}

        {/* Output text (shown even for timed-out results to display partial output) */}
        {!running && result && (
          content ? (
            <pre style={{
              ...styles.outputText,
              color: activeTab === 'errors' || activeTab === 'compile'
                ? '#FCA5A5'   // red tint for errors
                : '#E2E8F0',  // neutral for stdout
            }}>
              {content}
            </pre>
          ) : (
            !result.timed_out && (
              <div style={styles.placeholder}>
                <span style={{ color: '#64748B', fontSize: '13px' }}>
                  {activeTab === 'output'
                    ? 'No output produced'
                    : `No ${activeTab} output`}
                </span>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Spinner keyframes injected once
// ----------------------------------------------------------------

let _spinnerInjected = false;

function injectSpinnerStyle() {
  if (_spinnerInjected || typeof document === 'undefined') return;
  _spinnerInjected = true;

  const s = document.createElement('style');
  s.id = 'output-spinner-style';
  s.textContent = `
    @keyframes output-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(s);
}

// ----------------------------------------------------------------
// Styles
// ----------------------------------------------------------------

const styles = {
  panel: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100%',
    background:    '#0F172A',
    borderTop:     '1px solid #1E293B',
    overflow:      'hidden',
  },
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '6px 14px',
    borderBottom:   '1px solid #1E293B',
    flexShrink:     0,
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
  },
  title: {
    color:      '#94A3B8',
    fontSize:   '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  badge: {
    padding:      '1px 7px',
    borderRadius: '4px',
    fontSize:     '11px',
    fontWeight:   600,
    color:        '#fff',
  },
  langChip: {
    background:    '#1E293B',
    color:         '#64748B',
    padding:       '1px 7px',
    borderRadius:  '4px',
    fontSize:      '11px',
    fontFamily:    'monospace',
  },
  closeBtn: {
    background: 'none',
    border:     'none',
    color:      '#475569',
    cursor:     'pointer',
    fontSize:   '14px',
    padding:    '2px 6px',
    borderRadius:'4px',
    lineHeight: 1,
  },
  tabs: {
    display:      'flex',
    borderBottom: '1px solid #1E293B',
    flexShrink:   0,
  },
  tab: {
    background:   'none',
    border:       'none',
    color:        '#475569',
    padding:      '6px 14px',
    fontSize:     '12px',
    cursor:       'pointer',
    position:     'relative',
    display:      'flex',
    alignItems:   'center',
    gap:          '5px',
    transition:   'color 0.15s',
  },
  tabActive: {
    color:        '#E2E8F0',
    borderBottom: '2px solid #6366F1',
  },
  tabBadge: {
    background:   '#EF4444',
    color:        '#fff',
    borderRadius: '50%',
    width:        '14px',
    height:       '14px',
    fontSize:     '10px',
    fontWeight:   700,
    display:      'flex',
    alignItems:   'center',
    justifyContent:'center',
  },
  content: {
    flex:       1,
    overflow:   'auto',
    padding:    '12px 14px',
  },
  placeholder: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    height:         '100%',
    gap:            '10px',
  },
  spinner: {
    width:       '20px',
    height:      '20px',
    border:      '2px solid #1E293B',
    borderTop:   '2px solid #6366F1',
    borderRadius:'50%',
    animation:   'output-spin 0.8s linear infinite',
  },
  outputText: {
    fontFamily:  "'Fira Code', 'Cascadia Code', monospace",
    fontSize:    '13px',
    lineHeight:  1.6,
    margin:      0,
    whiteSpace:  'pre-wrap',
    wordBreak:   'break-word',
  },
  kbd: {
    background:   '#1E293B',
    border:       '1px solid #334155',
    borderRadius: '4px',
    padding:      '1px 6px',
    fontSize:     '12px',
    fontFamily:   'monospace',
    color:        '#94A3B8',
  },
};