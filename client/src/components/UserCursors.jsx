/**
 * UserCursors.jsx -- Remote cursor rendering in Monaco Editor
 *
 * Renders a coloured cursor + nametag for every other user in the room.
 * Uses Monaco's delta decorations API to overlay cursors at the correct
 * line/column position without interfering with the editor content.
 *
 * Props:
 *  editorRef   React ref  -- Monaco editor instance
 *  monacoRef   React ref  -- Monaco API object (from onMount in Editor.jsx)
 *  cursors     Map        -- Map<socketId, { userId, username, color, position }>
 *                           position: { lineNumber, column }
 *
 * How Monaco decorations work:
 *  editor.deltaDecorations(oldIds, newDecorations) returns new decoration ids.
 *  We store ids per socketId so we can remove/replace only that user's cursor
 *  without touching others. On every render we diff and update only changed cursors.
 */

import { useEffect, useRef } from 'react';

// Inject base CSS once (not on every render)
let stylesInjected = false;

function injectCursorStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    /* Nametag above the cursor (base style) */
    .remote-cursor-label {
      position:      absolute;
      top:           -18px;
      left:          0;
      padding:       1px 5px;
      border-radius: 3px;
      font-size:     11px;
      font-family:   'Fira Code', monospace;
      font-weight:   600;
      color:         #fff;
      white-space:   nowrap;
      pointer-events:none;
      z-index:       10;
    }
  `;
  document.head.appendChild(style);
}

// ── Per-user dynamic <style> elements for cursor colours ──
const userStyleElements = new Map();

function ensureUserCursorStyle(socketId, color) {
  const safeId = socketId.replace(/[^a-zA-Z0-9]/g, '');
  const className = `remote-cursor-${safeId}`;

  let styleEl = userStyleElements.get(socketId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = `cursor-style-${safeId}`;
    document.head.appendChild(styleEl);
    userStyleElements.set(socketId, styleEl);
  }

  styleEl.textContent = `
    .${className} {
      border-left: 2px solid ${color} !important;
      margin-left: -1px;
      pointer-events: none;
    }
  `;

  return className;
}

function removeUserCursorStyle(socketId) {
  const styleEl = userStyleElements.get(socketId);
  if (styleEl) {
    styleEl.remove();
    userStyleElements.delete(socketId);
  }
}

export default function UserCursors({ editorRef, monacoRef, cursors }) {
  // Map<socketId, string[]> -- decoration ids per user
  const decorationIds = useRef(new Map());

  useEffect(() => {
    injectCursorStyles();
  }, []);

  useEffect(() => {
    const editor = editorRef?.current;
    const monaco = monacoRef?.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    // Guard: if cursors is not iterable, bail out
    if (!cursors || typeof cursors.forEach !== 'function') return;

    // Track which socketIds we processed this render
    const processed = new Set();

    cursors.forEach((cursor, socketId) => {
      if (!cursor.position) return;

      processed.add(socketId);

      const { lineNumber, column } = cursor.position;
      const color = cursor.color || '#6366F1';

      // Build Monaco Range for this cursor position
      const range = new monaco.Range(lineNumber, column, lineNumber, column);

      // Inject/update per-user CSS with the correct colour
      const cursorClassName = ensureUserCursorStyle(socketId, color);

      const newDecorations = [
        {
          range,
          options: {
            className:      cursorClassName,
            hoverMessage:   { value: cursor.username },
            stickiness:     monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            zIndex:         10,
          },
        },
      ];

      // Replace only this user's old decorations
      const oldIds = decorationIds.current.get(socketId) || [];
      const newIds = editor.deltaDecorations(oldIds, newDecorations);
      decorationIds.current.set(socketId, newIds);
    });

    // Remove decorations for users who left
    // Convert to array first to avoid mutating the Map during iteration
    const staleEntries = Array.from(decorationIds.current.entries()).filter(
      ([socketId]) => !processed.has(socketId)
    );

    staleEntries.forEach(([socketId, ids]) => {
      editor.deltaDecorations(ids, []);
      decorationIds.current.delete(socketId);
      removeUserCursorStyle(socketId);
    });

  }, [cursors, editorRef, monacoRef]);

  // Cleanup all decorations and styles on unmount
  useEffect(() => {
    return () => {
      const editor = editorRef?.current;
      if (editor) {
        decorationIds.current.forEach((ids) => {
          editor.deltaDecorations(ids, []);
        });
      }
      decorationIds.current.clear();
      userStyleElements.forEach((styleEl) => styleEl.remove());
      userStyleElements.clear();
    };
  }, [editorRef]);

  // ----------------------------------------------------------------
  // Render nametags as DOM overlays (positioned absolutely over Monaco)
  // Monaco decorations alone can't render arbitrary HTML.
  // We use a transparent overlay div with absolutely-positioned nametags.
  // ----------------------------------------------------------------

  // Guard: if cursors is not a Map or iterable, render nothing
  if (!cursors || typeof cursors.entries !== 'function') {
    return null;
  }

  return (
    <div
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none', // clicks pass through to Monaco
        overflow:      'hidden',
        zIndex:        5,
      }}
    >
      {Array.from(cursors.entries()).map(([socketId, cursor]) => {
        if (!cursor.position || !editorRef?.current) return null;

        const editor = editorRef.current;
        const monaco = monacoRef?.current;
        if (!monaco) return null;

        // Convert line/column to pixel position
        // Monaco provides getScrolledVisiblePosition for this
        const pixelPos = editor.getScrolledVisiblePosition({
          lineNumber: cursor.position.lineNumber,
          column:     cursor.position.column,
        });

        if (!pixelPos) return null;

        return (
          <div
            key={socketId}
            style={{
              position:  'absolute',
              top:       pixelPos.top - 20, // above the cursor line
              left:      pixelPos.left,
              transform: 'translateY(0)',
            }}
          >
            {/* Nametag */}
            <div
              style={{
                background:   cursor.color || '#6366F1',
                color:        '#fff',
                padding:      '1px 6px',
                borderRadius: '3px',
                fontSize:     '11px',
                fontWeight:   600,
                fontFamily:   "'Fira Code', monospace",
                whiteSpace:   'nowrap',
                userSelect:   'none',
              }}
            >
              {cursor.username}
            </div>
            {/* Cursor line */}
            <div
              style={{
                width:      '2px',
                height:     '18px',
                background: cursor.color || '#6366F1',
                marginTop:  '1px',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}