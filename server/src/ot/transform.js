/**
 * transform.js — Operational Transformation Algorithm
 *
 * Every keystroke is an "operation":
 *   { type: 'insert', position: 5, char: 'X', userId: 'abc' }
 *   { type: 'delete', position: 5, userId: 'abc' }
 *
 * When two users type at the same time, their operations are "concurrent".
 * This function takes op1 and op2 (concurrent ops) and returns op1 adjusted
 * so it can be safely applied AFTER op2 without corrupting the document.
 */

/**
 * Clamp a position so it never goes below 0.
 * Upper-bound clamping happens in applyOperation where we have the actual doc.
 */
function clampMin(position) {
  return Math.max(0, position);
}

/**
 * Derive a stable tiebreaker string from an operation.
 * Falls back to '\x00' (lowest possible string) if userId is missing,
 * so ordering is always consistent even with anonymous users.
 */
function tiebreakerOf(op) {
  return (op.userId != null && op.userId !== '') ? String(op.userId) : '\x00';
}

/**
 * Transform op1 against op2.
 * @param {Object} op1 - The operation to transform
 * @param {Object} op2 - The operation to transform against
 * @returns {Object|null} - Transformed op1, or null if it becomes a no-op
 */
function transform(op1, op2) {
  if (!op1 || !op2) return op1;

  // ── Case 1: both inserts ──────────────────────────────────────
  if (op1.type === 'insert' && op2.type === 'insert') {
    if (op2.position < op1.position) {
      return { ...op1, position: clampMin(op1.position + 1) };
    }

    if (op2.position === op1.position) {
      // Stable tiebreaker — never depends on raw userId being present
      if (tiebreakerOf(op2) > tiebreakerOf(op1)) {
        return { ...op1, position: clampMin(op1.position + 1) };
      }
      return op1;
    }

    return op1;
  }

  // ── Case 2: insert then delete ───────────────────────────────
  if (op1.type === 'insert' && op2.type === 'delete') {
    if (op2.position < op1.position) {
      return { ...op1, position: clampMin(op1.position - 1) };
    }
    return op1;
  }

  // ── Case 3: delete then insert ───────────────────────────────
  if (op1.type === 'delete' && op2.type === 'insert') {
    if (op2.position <= op1.position) {
      return { ...op1, position: clampMin(op1.position + 1) };
    }
    return op1;
  }

  // ── Case 4: both deletes ─────────────────────────────────────
  if (op1.type === 'delete' && op2.type === 'delete') {
    if (op2.position < op1.position) {
      return { ...op1, position: clampMin(op1.position - 1) };
    }
    if (op2.position === op1.position) {
      // Character already deleted by op2 — op1 becomes a no-op
      return null;
    }
    return op1;
  }

  return op1;
}

/**
 * Apply an operation to a string document.
 * Includes full bounds validation — silently ignores out-of-range ops
 * rather than corrupting the document.
 *
 * @param {string} doc - Current document text
 * @param {Object} op  - Operation to apply
 * @returns {string}   - Updated document text
 */
function applyOperation(doc, op) {
  if (!op) return doc;

  if (op.type === 'insert') {
    // Clamp to [0, doc.length] — inserting beyond end just appends
    const pos = Math.max(0, Math.min(op.position, doc.length));
    // Guard: char must be a non-empty string
    if (typeof op.char !== 'string' || op.char.length === 0) return doc;
    return doc.slice(0, pos) + op.char + doc.slice(pos);
  }

  if (op.type === 'delete') {
    // Strictly out of bounds — ignore silently
    if (op.position < 0 || op.position >= doc.length) return doc;
    return doc.slice(0, op.position) + doc.slice(op.position + 1);
  }

  return doc;
}

module.exports = { transform, applyOperation };