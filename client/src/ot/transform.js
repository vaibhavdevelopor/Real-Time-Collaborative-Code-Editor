/**
 * transform.js -- Client-side copy of the OT algorithm
 *
 * IMPORTANT: This file must use ESM exports (export keyword),
 * NOT CommonJS (module.exports). Vite/browser cannot process CommonJS.
 *
 * Keep this file in sync with server/src/ot/transform.js.
 * The logic is identical -- only the export style differs.
 */

function clampMin(position) {
  return Math.max(0, position);
}

function tiebreakerOf(op) {
  return (op.userId != null && op.userId !== '') ? String(op.userId) : '\x00';
}

function insertLength(op) {
  return typeof op.char === 'string' ? op.char.length : 0;
}

/**
 * Transform op1 against op2.
 * Returns transformed op1, or null if it becomes a no-op.
 */
export function transform(op1, op2) {
  if (!op1 || !op2) return op1;

  // -- insert + insert ------------------------------------------
  if (op1.type === 'insert' && op2.type === 'insert') {
    if (op2.position < op1.position) {
      return { ...op1, position: clampMin(op1.position + insertLength(op2)) };
    }
    if (op2.position === op1.position) {
      if (tiebreakerOf(op2) > tiebreakerOf(op1)) {
        return { ...op1, position: clampMin(op1.position + insertLength(op2)) };
      }
      return op1;
    }
    return op1;
  }

  // -- insert + delete ------------------------------------------
  if (op1.type === 'insert' && op2.type === 'delete') {
    if (op2.position < op1.position) {
      return { ...op1, position: clampMin(op1.position - 1) };
    }
    return op1;
  }

  // -- delete + insert ------------------------------------------
  if (op1.type === 'delete' && op2.type === 'insert') {
    if (op2.position <= op1.position) {
      return { ...op1, position: clampMin(op1.position + insertLength(op2)) };
    }
    return op1;
  }

  // -- delete + delete ------------------------------------------
  if (op1.type === 'delete' && op2.type === 'delete') {
    if (op2.position < op1.position) {
      return { ...op1, position: clampMin(op1.position - 1) };
    }
    if (op2.position === op1.position) return null;
    return op1;
  }

  return op1;
}

/**
 * Apply an operation to a string document.
 * Includes full bounds validation.
 */
export function applyOperation(doc, op) {
  if (!op) return doc;

  if (op.type === 'insert') {
    const pos = Math.max(0, Math.min(op.position, doc.length));
    if (typeof op.char !== 'string' || op.char.length === 0) return doc;
    return doc.slice(0, pos) + op.char + doc.slice(pos);
  }

  if (op.type === 'delete') {
    if (op.position < 0 || op.position >= doc.length) return doc;
    return doc.slice(0, op.position) + doc.slice(op.position + 1);
  }

  return doc;
}
