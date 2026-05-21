/**
 * Chat.jsx -- Real-time chat sidebar
 *
 * Messages are broadcast via Socket.io 'chat-message' event.
 * No persistence -- messages exist only for the current session.
 * (For persistence, store messages in MongoDB on the server side.)
 *
 * Props:
 *  messages   array   -- [{ userId, username, color, text, timestamp }]
 *  onSend     fn      -- called with (text) when user sends a message
 *  currentUserId string -- to right-align own messages
 *  users      array   -- [{userId, username, color}] for presence list
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Format timestamp safely -- outside component to avoid re-creation each render
const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
  });
};

export default function Chat({ messages = [], onSend, currentUserId, users = [] }) {
  const [input,      setInput]      = useState('');
  const [activeTab,  setActiveTab]  = useState('chat'); // 'chat' | 'users'
  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  const listRef      = useRef(null);
  const isNearBottom = useRef(true);

  // Track whether user is scrolled near the bottom
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  // Auto-scroll only if user is already near the bottom
  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Send message
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setInput('');
    inputRef.current?.focus();
  }, [input, onSend]);

  // Send on Enter (Shift+Enter for newline -- but we keep input single line)
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);



  return (
    <div style={styles.container}>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        <button
          onClick={() => setActiveTab('chat')}
          style={{ ...styles.tab, ...(activeTab === 'chat' ? styles.tabActive : {}) }}
        >
          Chat
          {messages.length > 0 && (
            <span style={styles.count}>{messages.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{ ...styles.tab, ...(activeTab === 'users' ? styles.tabActive : {}) }}
        >
          Users
          <span style={styles.count}>{users.length}</span>
        </button>
      </div>

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <>
          {/* Message list */}
          <div ref={listRef} onScroll={handleScroll} style={styles.messageList}>
            {messages.length === 0 && (
              <div style={styles.emptyState}>
                <span>No messages yet.</span>
                <span>Say hello! 👋</span>
              </div>
            )}

            {messages.map((msg, index) => {
              const isOwn = msg.userId === currentUserId;
              const showAvatar = index === 0
                || messages[index - 1]?.userId !== msg.userId;

              return (
                <div
                  key={`${msg.timestamp}-${index}`}
                  style={{
                    ...styles.messageRow,
                    flexDirection: isOwn ? 'row-reverse' : 'row',
                    marginTop:     showAvatar ? '12px' : '2px',
                  }}
                >
                  {/* Avatar -- only show on first message in a group */}
                  {showAvatar ? (
                    <div
                      title={msg.username}
                      style={{
                        ...styles.avatar,
                        background:  msg.color || '#6366F1',
                        marginLeft:  isOwn ? '8px' : '0',
                        marginRight: isOwn ? '0'  : '8px',
                      }}
                    >
                      {msg.username?.[0]?.toUpperCase() || '?'}
                    </div>
                  ) : (
                    // Spacer to align messages without avatar
                    <div style={{ width: '28px', flexShrink: 0,
                      marginLeft: isOwn ? '8px' : '0',
                      marginRight: isOwn ? '0' : '8px',
                    }} />
                  )}

                  <div style={{
                    ...styles.messageBubble,
                    background:   isOwn ? '#4F46E5' : '#1E293B',
                    borderRadius: isOwn
                      ? '12px 4px 12px 12px'
                      : '4px 12px 12px 12px',
                    alignItems:   isOwn ? 'flex-end' : 'flex-start',
                  }}>
                    {/* Username -- only on first in group */}
                    {showAvatar && !isOwn && (
                      <span style={{ ...styles.senderName, color: msg.color }}>
                        {msg.username}
                      </span>
                    )}
                    <span style={styles.messageText}>{msg.text}</span>
                    <span style={styles.timestamp}>{formatTime(msg.timestamp)}</span>
                  </div>
                </div>
              );
            })}

            {/* Scroll anchor */}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={styles.inputArea}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              maxLength={500}
              style={styles.input}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              style={{
                ...styles.sendBtn,
                opacity: input.trim() ? 1 : 0.4,
                cursor:  input.trim() ? 'pointer' : 'default',
              }}
              title="Send (Enter)"
            >
              ↑
            </button>
          </div>
        </>
      )}

      {/* Users tab */}
      {activeTab === 'users' && (
        <div style={styles.userList}>
          {users.length === 0 && (
            <div style={styles.emptyState}>
              <span>No users in room</span>
            </div>
          )}
          {users.map((user, index) => (
            <div key={user.userId || `user-${index}`} style={styles.userRow}>
              <div
                style={{
                  ...styles.avatar,
                  background: user.color || '#6366F1',
                }}
              >
                {user.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={styles.userInfo}>
                <span style={styles.userName}>
                  {user.username}
                  {user.userId === currentUserId && (
                    <span style={styles.youBadge}> (you)</span>
                  )}
                </span>
              </div>
              {/* Online indicator */}
              <div style={styles.onlineDot} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Styles
// ----------------------------------------------------------------

const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100%',
    background:    '#0F172A',
    borderLeft:    '1px solid #1E293B',
    overflow:      'hidden',
  },
  tabBar: {
    display:      'flex',
    borderBottom: '1px solid #1E293B',
    flexShrink:   0,
  },
  tab: {
    flex:        1,
    background:  'none',
    border:      'none',
    color:       '#475569',
    padding:     '10px',
    fontSize:    '13px',
    cursor:      'pointer',
    display:     'flex',
    alignItems:  'center',
    justifyContent:'center',
    gap:         '6px',
    transition:  'color 0.15s',
  },
  tabActive: {
    color:        '#E2E8F0',
    borderBottom: '2px solid #6366F1',
  },
  count: {
    background:   '#1E293B',
    color:        '#94A3B8',
    borderRadius: '10px',
    padding:      '0 6px',
    fontSize:     '11px',
    fontWeight:   600,
  },
  messageList: {
    flex:       1,
    overflowY:  'auto',
    padding:    '8px 10px',
    display:    'flex',
    flexDirection:'column',
  },
  emptyState: {
    flex:           1,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    color:          '#334155',
    fontSize:       '13px',
    gap:            '4px',
    padding:        '20px',
    textAlign:      'center',
  },
  messageRow: {
    display:    'flex',
    alignItems: 'flex-end',
  },
  avatar: {
    width:         '28px',
    height:        '28px',
    borderRadius:  '50%',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    fontSize:      '12px',
    fontWeight:    700,
    color:         '#fff',
    flexShrink:    0,
  },
  messageBubble: {
    maxWidth:      '75%',
    padding:       '6px 10px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '2px',
  },
  senderName: {
    fontSize:   '11px',
    fontWeight: 600,
    marginBottom:'2px',
  },
  messageText: {
    fontSize:    '13px',
    color:       '#E2E8F0',
    lineHeight:  1.4,
    wordBreak:   'break-word',
  },
  timestamp: {
    fontSize: '10px',
    color:    '#475569',
  },
  inputArea: {
    display:     'flex',
    gap:         '6px',
    padding:     '10px',
    borderTop:   '1px solid #1E293B',
    flexShrink:  0,
  },
  input: {
    flex:         1,
    background:   '#1E293B',
    border:       '1px solid #334155',
    borderRadius: '8px',
    padding:      '8px 12px',
    color:        '#E2E8F0',
    fontSize:     '13px',
    outline:      'none',
  },
  sendBtn: {
    background:   '#6366F1',
    border:       'none',
    borderRadius: '8px',
    color:        '#fff',
    width:        '36px',
    height:       '36px',
    fontSize:     '16px',
    fontWeight:   700,
    display:      'flex',
    alignItems:   'center',
    justifyContent:'center',
  },
  userList: {
    flex:      1,
    overflowY: 'auto',
    padding:   '8px',
  },
  userRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '10px',
    padding:    '8px',
    borderRadius:'8px',
  },
  userInfo: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
  },
  userName: {
    color:      '#E2E8F0',
    fontSize:   '13px',
    fontWeight: 500,
  },
  youBadge: {
    color:      '#64748B',
    fontSize:   '11px',
    fontWeight: 400,
  },
  onlineDot: {
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
    background:   '#10B981',
    boxShadow:    '0 0 6px #10B981',
    flexShrink:   0,
  },
};