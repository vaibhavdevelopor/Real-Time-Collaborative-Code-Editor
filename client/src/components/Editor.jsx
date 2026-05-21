/**
 * Editor.jsx -- Monaco Editor wrapper with OT integration
 *
 * Install dependency:
 *  cd client && npm install @monaco-editor/react
 *
 * Responsibilities:
 *  1. Render Monaco Editor (VSCode's editor engine)
 *  2. On user keypress: create operation, call handleLocalOp, emit via socket
 *  3. On incoming remote op: call handleRemoteOp, apply to Monaco
 *  4. On own op confirmed: call handleOpAck, skip re-applying
 *  5. On cursor move: emit cursor position
 *  6. Render remote cursors via UserCursors
 *
 * Known limitation:
 *  Monaco's changeEvent.changes offsets are based on the model state
 *  at the time of the event. Multi-cursor edits (multiple changes in one
 *  event) may produce incorrect OT positions if changes interact.
 *  For a demo this is acceptable -- fixing it requires reconstructing
 *  positions after each change is applied sequentially.
 *
 * Props:
 *  language       string   -- current language for syntax highlighting
 *  socketId       string   -- this client's socket id (to filter own ops)
 *  remoteCursors  Map      -- Map<socketId, {userId,username,color,position}>
 *  emitChange     fn       -- from useSocket
 *  emitCursor     fn       -- from useSocket
 *  handleLocalOp  fn       -- from useOT
 *  handleRemoteOp fn       -- from useOT
 *  handleOpAck    fn       -- from useOT
 *  externalOp     object   -- incoming op { operation, revision, fromSocket }
 *  onExternalApplied fn    -- clears externalOp in Room.jsx after we handle it
 *  initialDoc     string   -- document content from server on join/resync
 */

import { useRef, useEffect, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import UserCursors from './UserCursors';

const STARTER_CODE = {
  javascript: '// Start coding together!\nconsole.log("Hello, World!");\n',
  typescript: '// Start coding together!\nconst greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("World"));\n',
  python:     '# Start coding together!\nprint("Hello, World!")\n',
  cpp:        '// Start coding together!\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
  java:       '// Start coding together!\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  go:         '// Start coding together!\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n',
  rust:       '// Start coding together!\nfn main() {\n    println!("Hello, World!");\n}\n',
};

export default function Editor({
  language          = 'javascript',
  socketId,
  remoteCursors     = new Map(), // passed as prop from Room.jsx -- no window globals
  emitChange,
  emitCursor,
  handleLocalOp,
  handleRemoteOp,
  handleOpAck,
  externalOp,
  onExternalApplied,
  initialDoc        = '',
  onValueChange,
}) {
  const editorRef  = useRef(null);  // Monaco editor instance
  const modelRef   = useRef(null);  // Monaco model instance
  const monacoRef  = useRef(null);  // Monaco API object (from onMount) -- NOT window.monaco
  const isApplying = useRef(false); // guard: true while applying a remote op

  // Stable refs for callbacks used inside effects with empty deps
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const prevLanguageRef = useRef(language);

  // ----------------------------------------------------------------
  // Mount Monaco editor
  // ----------------------------------------------------------------

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current  = editor;
    modelRef.current   = editor.getModel();
    monacoRef.current  = monaco; // store monaco API from onMount -- safe and reliable

    // Set initial document content -- guarded so onChange doesn't fire OT ops
    const startContent = initialDoc || STARTER_CODE[language] || '';
    isApplying.current = true;
    editor.setValue(startContent);
    isApplying.current = false;

    // Sync editorValueRef in Room.jsx so Run button has the content
    onValueChangeRef.current?.(startContent);

    // Emit cursor position on every cursor move
    editor.onDidChangeCursorPosition((e) => {
      emitCursor?.({
        lineNumber: e.position.lineNumber,
        column:     e.position.column,
      });
    });
  }, []); // empty deps -- runs once on mount only

  // ----------------------------------------------------------------
  // Update editor content when initialDoc changes after mount.
  // This handles the case where the socket delivers the document
  // AFTER Monaco has already mounted (race condition on slow networks).
  // Only updates if content actually differs to avoid cursor jumps.
  // ----------------------------------------------------------------

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !initialDoc) return;

    const current = editor.getValue();
    if (current !== initialDoc) {
      isApplying.current = true;
      editor.setValue(initialDoc);
      isApplying.current = false;
      // Sync editorValueRef in Room.jsx
      onValueChangeRef.current?.(initialDoc);
    }
  }, [initialDoc]);

  // ----------------------------------------------------------------
  // Load starter code when language changes
  // ----------------------------------------------------------------

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // Skip initial mount -- handleEditorDidMount handles that
    if (prevLanguageRef.current === language) return;
    prevLanguageRef.current = language;

    const newCode = STARTER_CODE[language] || '';
    isApplying.current = true;
    editor.setValue(newCode);
    isApplying.current = false;
    onValueChangeRef.current?.(newCode);
  }, [language]);

  // ----------------------------------------------------------------
  // Handle local user typing
  // ----------------------------------------------------------------

  const handleChange = useCallback((newValue, changeEvent) => {
    if (isApplying.current) return; // skip programmatic edits
    if (!changeEvent?.changes) return;

    // Update Room.jsx's editorValueRef so Run button has current code
    onValueChange?.(newValue);

    for (const change of changeEvent.changes) {
      const { rangeOffset, rangeLength, text } = change;

      // Emit delete ops for replaced/deleted characters
      for (let i = 0; i < rangeLength; i++) {
        const op = { type: 'delete', position: rangeOffset, userId: socketId };
        const clientRevision = handleLocalOp(op);
        emitChange?.(op, clientRevision);
      }

      // Emit insert op for the pasted/typed text chunk
      if (text.length > 0) {
        const op = {
          type:     'insert',
          position: rangeOffset,
          char:     text,
          userId:   socketId,
        };
        const clientRevision = handleLocalOp(op);
        emitChange?.(op, clientRevision);
      }
    }
  }, [socketId, handleLocalOp, emitChange, onValueChange]);

  // ----------------------------------------------------------------
  // Apply a remote operation to Monaco using stored monaco ref.
  // Uses plain range objects (same as delete path) -- no window.monaco.
  // ----------------------------------------------------------------

  const applyOpToEditor = useCallback((op) => {
    const editor = editorRef.current;
    const model  = modelRef.current;
    if (!editor || !model || !op) return;

    isApplying.current = true;

    try {
      if (op.type === 'insert') {
        const pos = model.getPositionAt(op.position);
        model.applyEdits([{
          range: {
            startLineNumber: pos.lineNumber,
            startColumn:     pos.column,
            endLineNumber:   pos.lineNumber,
            endColumn:       pos.column,
          },
          text:             op.char,
          forceMoveMarkers: true,
        }]);
      }

      if (op.type === 'delete') {
        const startPos = model.getPositionAt(op.position);
        const endPos   = model.getPositionAt(op.position + 1);
        model.applyEdits([{
          range: {
            startLineNumber: startPos.lineNumber,
            startColumn:     startPos.column,
            endLineNumber:   endPos.lineNumber,
            endColumn:       endPos.column,
          },
          text:             '',
          forceMoveMarkers: true,
        }]);
      }

      // Sync the Room.jsx reference so the Run button executes the latest code
      onValueChangeRef.current?.(model.getValue());

    } catch (err) {
      console.error('[Editor] applyOpToEditor error:', err);
    } finally {
      isApplying.current = false;
    }
  }, []);

  // ----------------------------------------------------------------
  // React to incoming external ops from Room.jsx
  // ----------------------------------------------------------------

  useEffect(() => {
    if (!externalOp) return;

    const { operation, revision, fromSocket } = externalOp;

    if (fromSocket === socketId) {
      // Own op confirmed by server -- ack only, do NOT re-apply
      handleOpAck(revision);
    } else {
      // Remote op from another user -- transform then apply
      const transformed = handleRemoteOp(operation, revision);
      if (transformed) applyOpToEditor(transformed);
    }

    onExternalApplied?.();
  }, [externalOp, socketId, handleOpAck, handleRemoteOp, applyOpToEditor, onExternalApplied]);

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MonacoEditor
        height="100%"
        language={language}
        theme="vs-dark"
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize:             14,
          fontFamily:           "'Fira Code', 'Cascadia Code', monospace",
          fontLigatures:        true,
          minimap:              { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap:             'on',
          tabSize:              2,
          automaticLayout:      true,
          padding:              { top: 16 },
          cursorBlinking:       'smooth',
          smoothScrolling:      true,
          renderLineHighlight:  'all',
        }}
      />
      {/* remoteCursors passed as prop -- no window globals */}
      <UserCursors
        editorRef={editorRef}
        monacoRef={monacoRef}
        cursors={remoteCursors}
      />
    </div>
  );
}