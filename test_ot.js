/**
 * test_ot.js -- Standalone Verification Script for Operational Transformation (OT)
 *
 * This script tests the 4 mathematical collision matrices handled by our central OT engine:
 *   1. Insert vs. Insert (Concurrent insertions at different or identical indices)
 *   2. Insert vs. Delete (Insertion colliding with a deletion range)
 *   3. Delete vs. Insert (Deletion colliding with a prior insertion)
 *   4. Delete vs. Delete (Concurrent deletions overlapping or duplicating)
 *
 * Run locally via: node test_ot.js
 */

const { transform, applyOperation } = require('./server/src/ot/transform');

console.log('─── ⚡ MaxHeap OT Engine Verification & Unit Tests ───\n');

let passed = 0;
let total = 0;

function assertTest(name, condition, details = '') {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name} ${details}`);
  }
}

// ─── Case 1: Insert vs. Insert ───
// If User B inserts "Hello " (length 6) at index 0 before User A inserts "World" at index 0,
// User A's index must shift forward by 6.
{
  const opA = { type: 'insert', position: 0, char: 'World', userId: 'user_a' };
  const opB = { type: 'insert', position: 0, char: 'Hello ', userId: 'user_z' }; // user_z wins tiebreaker over user_a
  
  const transformedA = transform(opA, opB);
  assertTest(
    'Case 1 (Insert vs Insert - Tiebreaker & Shift)',
    transformedA.position === 6 && transformedA.char === 'World',
    `Expected position 6, got ${transformedA.position}`
  );
}

// ─── Case 2: Insert vs. Delete ───
// If User A wants to insert "X" at index 10, but User B deleted 5 characters before index 10 (indices 2 to 7),
// User A's target position must shift backward by 5 (new position: 5).
{
  const opA = { type: 'insert', position: 10, char: 'X', userId: 'user_a' };
  const opB = { type: 'delete', position: 2, length: 5, userId: 'user_b' };
  
  const transformedA = transform(opA, opB);
  assertTest(
    'Case 2 (Insert vs Delete - Backward Index Shift)',
    transformedA.position === 5 && transformedA.char === 'X',
    `Expected position 5, got ${transformedA.position}`
  );
}

// ─── Case 3: Delete vs. Insert ───
// If User A wants to delete 3 characters at index 0 ("CAT"), but User B inserted "SUPER " (length 6) at index 0,
// User A's deletion index must shift forward by 6 so it still deletes "CAT".
{
  const opA = { type: 'delete', position: 0, length: 3, userId: 'user_a' };
  const opB = { type: 'insert', position: 0, char: 'SUPER ', userId: 'user_b' };
  
  const transformedA = transform(opA, opB);
  assertTest(
    'Case 3 (Delete vs Insert - Forward Index Shift)',
    transformedA.position === 6 && transformedA.length === 3,
    `Expected position 6, got ${transformedA.position}`
  );
}

// ─── Case 4: Delete vs. Delete (Overlap / Double-Deletion Prevention) ───
// If User A and User B both try to delete the exact same 4 characters at index 5 simultaneously,
// User A's operation should transform to null to prevent deleting the next word twice.
{
  const opA = { type: 'delete', position: 5, length: 4, userId: 'user_a' };
  const opB = { type: 'delete', position: 5, length: 4, userId: 'user_b' };
  
  const transformedA = transform(opA, opB);
  assertTest(
    'Case 4 (Delete vs Delete - Double Deletion Prevention)',
    transformedA === null,
    `Expected null, got ${JSON.stringify(transformedA)}`
  );
}

// ─── Case 5: End-to-End Document Convergence Test ───
// Verify that two concurrent edits applied in different orders converge to the exact same text string.
{
  const initialDoc = 'cat';
  // User 1 appends "s" to make "cats" (position 3)
  const op1 = { type: 'insert', position: 3, char: 's', userId: 'user_1' };
  // User 2 prepends "big " to make "big cat" (position 0)
  const op2 = { type: 'insert', position: 0, char: 'big ', userId: 'user_2' };

  // Server applying op2 then transformed op1
  const docAfterOp2 = applyOperation(initialDoc, op2); // "big cat"
  const op1Transformed = transform(op1, op2); // shifts position from 3 to 7
  const finalDoc1 = applyOperation(docAfterOp2, op1Transformed); // "big cats"

  // Client applying op1 then transformed op2
  const docAfterOp1 = applyOperation(initialDoc, op1); // "cats"
  const op2Transformed = transform(op2, op1); // stays at position 0
  const finalDoc2 = applyOperation(docAfterOp1, op2Transformed); // "big cats"

  assertTest(
    'Case 5 (End-to-End Document Convergence)',
    finalDoc1 === finalDoc2 && finalDoc1 === 'big cats',
    `Expected "big cats", got "${finalDoc1}" vs "${finalDoc2}"`
  );
}

console.log(`\n─── Result: ${passed}/${total} Tests Passed ───`);
if (passed === total) {
  console.log('🏆 All Operational Transformation invariants verified successfully!');
  process.exit(0);
} else {
  process.exit(1);
}
