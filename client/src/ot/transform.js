/**
 * transform.js -- Client-side copy of the OT algorithm.
 *
 * Keep this file in sync with server/src/ot/transform.js.
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

function deleteLength(op) {
  return Math.max(1, Number.isFinite(op.length) ? Math.floor(op.length) : 1);
}

export function transform(op1, op2) {
  if (!op1 || !op2) return op1;

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

  if (op1.type === 'insert' && op2.type === 'delete') {
    const start2 = op2.position;
    const end2 = op2.position + deleteLength(op2);

    if (deleteLength(op2) > 1 && op1.position > start2 && op1.position < end2) {
      return null;
    }

    if (op2.position < op1.position) {
      const removedBefore = Math.max(
        0,
        Math.min(op1.position, op2.position + deleteLength(op2)) - op2.position
      );
      return { ...op1, position: clampMin(op1.position - removedBefore) };
    }
    return op1;
  }

  if (op1.type === 'delete' && op2.type === 'insert') {
    const start1 = op1.position;
    const end1 = op1.position + deleteLength(op1);

    if (op2.position <= op1.position) {
      return { ...op1, position: clampMin(op1.position + insertLength(op2)) };
    }
    if (op2.position > start1 && op2.position < end1) {
      return { ...op1, length: deleteLength(op1) + insertLength(op2) };
    }
    return op1;
  }

  if (op1.type === 'delete' && op2.type === 'delete') {
    const start1 = op1.position;
    const end1 = op1.position + deleteLength(op1);
    const start2 = op2.position;
    const end2 = op2.position + deleteLength(op2);
    const removedBefore = Math.max(0, Math.min(start1, end2) - start2);
    const overlap = Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
    const nextLength = deleteLength(op1) - overlap;

    if (nextLength <= 0) return null;

    return { ...op1, position: clampMin(start1 - removedBefore), length: nextLength };
  }

  return op1;
}

export function applyOperation(doc, op) {
  if (!op) return doc;

  if (op.type === 'insert') {
    const pos = Math.max(0, Math.min(op.position, doc.length));
    if (typeof op.char !== 'string' || op.char.length === 0) return doc;
    return doc.slice(0, pos) + op.char + doc.slice(pos);
  }

  if (op.type === 'delete') {
    if (op.position < 0 || op.position >= doc.length) return doc;
    return doc.slice(0, op.position) + doc.slice(op.position + deleteLength(op));
  }

  return doc;
}
