/**
 * transform.test.js -- Jest tests for the OT algorithm
 *
 * Run with:     npm test
 * Coverage:     npm test -- --coverage
 *
 * Tests every combination of concurrent operations plus edge cases.
 * This file is what you show in interviews to prove you think about correctness.
 */

const { transform, applyOperation } = require('./transform');

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const ins = (position, char, userId = 'user-A') => ({ type: 'insert', position, char, userId });
const del = (position, userId = 'user-A')       => ({ type: 'delete', position, userId });

/**
 * The gold-standard convergence check.
 *
 * Applies op1 then transformed-op2, AND op2 then transformed-op1.
 * Both paths must produce the same final document.
 * This is the core correctness property of OT.
 */
function checkConvergence(doc, op1, op2) {
  // Path 1: apply op1 first, transform op2 against op1, apply result
  const doc1a = applyOperation(doc, op1);
  const op2t  = transform(op2, op1);
  const doc1b = applyOperation(doc1a, op2t);

  // Path 2: apply op2 first, transform op1 against op2, apply result
  const doc2a = applyOperation(doc, op2);
  const op1t  = transform(op1, op2);
  const doc2b = applyOperation(doc2a, op1t);

  expect(doc1b).toBe(doc2b);
  return doc1b;
}

// ----------------------------------------------------------------
// SECTION 1 -- insert + insert
// ----------------------------------------------------------------

describe('insert + insert', () => {
  test('op2 before op1 -- op1 shifts right by 1', () => {
    const op1 = ins(5, 'X', 'user-A');
    const op2 = ins(2, 'Y', 'user-B');
    const result = transform(op1, op2);
    expect(result.position).toBe(6);
    expect(result.char).toBe('X');
  });

  test('op2 after op1 -- op1 unchanged', () => {
    const op1 = ins(2, 'X', 'user-A');
    const op2 = ins(8, 'Y', 'user-B');
    const result = transform(op1, op2);
    expect(result.position).toBe(2);
  });

  test('same position -- higher userId wins earlier slot, op1 shifts right', () => {
    // user-B > user-A lexicographically, so op2 wins the lower position
    const op1 = ins(5, 'X', 'user-A');
    const op2 = ins(5, 'Y', 'user-B');
    const result = transform(op1, op2);
    expect(result.position).toBe(6);
  });

  test('same position -- reversed tiebreaker, op1 stays', () => {
    // user-Z > user-A, so op1 wins -- no shift
    const op1 = ins(5, 'X', 'user-Z');
    const op2 = ins(5, 'Y', 'user-A');
    const result = transform(op1, op2);
    expect(result.position).toBe(5);
  });

  test('same position -- missing userId does not throw', () => {
    const op1 = ins(3, 'X');
    const op2 = { type: 'insert', position: 3, char: 'Y' }; // no userId
    expect(() => transform(op1, op2)).not.toThrow();
  });

  test('convergence -- op2 before op1', () => {
    const merged = checkConvergence('Hello', ins(4, 'X', 'user-A'), ins(1, 'Y', 'user-B'));
    expect(merged).toBe('HYellXo');
  });

  test('convergence -- same position, both chars survive', () => {
    const merged = checkConvergence('abcde', ins(2, 'X', 'user-A'), ins(2, 'Y', 'user-B'));
    expect(merged).toContain('X');
    expect(merged).toContain('Y');
    expect(merged.length).toBe(7);
  });
});

// ----------------------------------------------------------------
// SECTION 2 -- insert + delete
// ----------------------------------------------------------------

describe('insert + delete', () => {
  test('delete before insert -- insert shifts left by 1', () => {
    const result = transform(ins(5, 'X', 'user-A'), del(2, 'user-B'));
    expect(result.position).toBe(4);
  });

  test('delete at insert position -- insert stays', () => {
    const result = transform(ins(5, 'X', 'user-A'), del(5, 'user-B'));
    expect(result.position).toBe(5);
  });

  test('delete after insert -- insert unchanged', () => {
    const result = transform(ins(3, 'X', 'user-A'), del(7, 'user-B'));
    expect(result.position).toBe(3);
  });

  test('convergence -- delete before insert', () => {
    checkConvergence('Hello World', ins(8, 'X', 'user-A'), del(2, 'user-B'));
  });
});

// ----------------------------------------------------------------
// SECTION 3 -- delete + insert
// ----------------------------------------------------------------

describe('delete + insert', () => {
  test('insert before delete -- delete shifts right by 1', () => {
    const result = transform(del(5, 'user-A'), ins(2, 'Y', 'user-B'));
    expect(result.position).toBe(6);
  });

  test('insert at delete position -- delete shifts right by 1', () => {
    const result = transform(del(5, 'user-A'), ins(5, 'Y', 'user-B'));
    expect(result.position).toBe(6);
  });

  test('insert after delete -- delete unchanged', () => {
    const result = transform(del(3, 'user-A'), ins(8, 'Y', 'user-B'));
    expect(result.position).toBe(3);
  });

  test('convergence -- insert before delete', () => {
    checkConvergence('abcdef', del(4, 'user-A'), ins(1, 'Z', 'user-B'));
  });
});

// ----------------------------------------------------------------
// SECTION 4 -- delete + delete
// ----------------------------------------------------------------

describe('delete + delete', () => {
  test('op2 before op1 -- op1 shifts left by 1', () => {
    const result = transform(del(5, 'user-A'), del(2, 'user-B'));
    expect(result.position).toBe(4);
  });

  test('op2 after op1 -- op1 unchanged', () => {
    const result = transform(del(2, 'user-A'), del(7, 'user-B'));
    expect(result.position).toBe(2);
  });

  test('same position -- op1 becomes null (already deleted by op2)', () => {
    const result = transform(del(5, 'user-A'), del(5, 'user-B'));
    expect(result).toBeNull();
  });

  test('convergence -- different positions', () => {
    const merged = checkConvergence('abcdef', del(1, 'user-A'), del(4, 'user-B'));
    expect(merged.length).toBe(4);
  });

  test('convergence -- same position deletes only remove one char', () => {
    const merged = checkConvergence('abcde', del(2, 'user-A'), del(2, 'user-B'));
    expect(merged.length).toBe(4); // only 1 char removed despite 2 delete ops
    expect(merged).toBe('abde');
  });
});

// ----------------------------------------------------------------
// SECTION 5 -- applyOperation bounds validation
// ----------------------------------------------------------------

describe('applyOperation -- bounds validation', () => {
  test('insert at position 0', () => {
    expect(applyOperation('hello', ins(0, 'X'))).toBe('Xhello');
  });

  test('insert at end (doc.length)', () => {
    expect(applyOperation('hello', ins(5, 'X'))).toBe('helloX');
  });

  test('insert beyond end -- clamps to end', () => {
    expect(applyOperation('hello', ins(999, 'X'))).toBe('helloX');
  });

  test('insert at negative position -- clamps to 0', () => {
    expect(applyOperation('hello', ins(-5, 'X'))).toBe('Xhello');
  });

  test('insert with empty char -- no change', () => {
    expect(applyOperation('hello', { type: 'insert', position: 2, char: '' })).toBe('hello');
  });

  test('insert with undefined char -- no change', () => {
    expect(applyOperation('hello', { type: 'insert', position: 2 })).toBe('hello');
  });

  test('delete at position 0', () => {
    expect(applyOperation('hello', del(0))).toBe('ello');
  });

  test('delete at last position', () => {
    expect(applyOperation('hello', del(4))).toBe('hell');
  });

  test('delete out of bounds -- no change', () => {
    expect(applyOperation('hello', del(999))).toBe('hello');
  });

  test('delete at negative position -- no change', () => {
    expect(applyOperation('hello', del(-1))).toBe('hello');
  });

  test('delete on empty document -- no change', () => {
    expect(applyOperation('', del(0))).toBe('');
  });

  test('insert on empty document', () => {
    expect(applyOperation('', ins(0, 'A'))).toBe('A');
  });
});

// ----------------------------------------------------------------
// SECTION 6 -- null / undefined safety
// ----------------------------------------------------------------

describe('null / undefined safety', () => {
  test('transform(null, op2) returns null', () => {
    expect(transform(null, ins(1, 'X'))).toBeNull();
  });

  test('transform(op1, null) returns op1 unchanged', () => {
    const op1 = ins(3, 'X');
    expect(transform(op1, null)).toEqual(op1);
  });

  test('applyOperation with null op returns doc unchanged', () => {
    expect(applyOperation('hello', null)).toBe('hello');
  });

  test('applyOperation with unknown op type returns doc unchanged', () => {
    expect(applyOperation('hello', { type: 'replace', position: 1, char: 'X' })).toBe('hello');
  });
});

// ----------------------------------------------------------------
// SECTION 7 -- real-world scenarios
// ----------------------------------------------------------------

describe('real-world scenarios', () => {
  test('two users typing simultaneously in a sentence', () => {
    // Both start with "Hello World"
    // user-A inserts '!' at 11 (end), user-B inserts ',' at 5 (after Hello)
    // Final result must be "Hello, World!" regardless of arrival order
    const merged = checkConvergence(
      'Hello World',
      ins(11, '!', 'user-A'),
      ins(5,  ',', 'user-B')
    );
    expect(merged).toBe('Hello, World!');
  });

  test('one user types while another deletes -- both paths converge', () => {
    checkConvergence('abcde', del(2, 'user-A'), ins(4, 'X', 'user-B'));
  });

  test('chain of 3 concurrent inserts -- all 6 orderings converge', () => {
    // True convergence: apply all 3 ops in every possible order
    // after transforming each against the others already applied.
    // All 6 permutations must produce the same final document.
    const doc = 'abc';
    const ops = [
      ins(0, '1', 'user-1'),
      ins(1, '2', 'user-2'),
      ins(2, '3', 'user-3'),
    ];

    function applyAll(doc, orderedOps) {
      // Apply ops in given order, transforming each against all previous
      let result = doc;
      const applied = [];
      for (const op of orderedOps) {
        let transformed = op;
        for (const prev of applied) {
          transformed = transform(transformed, prev);
          if (!transformed) break;
        }
        if (transformed) {
          result = applyOperation(result, transformed);
          applied.push(transformed);
        }
      }
      return result;
    }

    // All 6 permutations of [0,1,2]
    const permutations = [
      [0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]
    ];

    const results = permutations.map(order => applyAll(doc, order.map(i => ops[i])));

    // Every permutation must produce the same result
    results.forEach(r => expect(r).toBe(results[0]));

    // All 3 inserted digits must be present
    expect(results[0]).toContain('1');
    expect(results[0]).toContain('2');
    expect(results[0]).toContain('3');
    expect(results[0].length).toBe(6);
  });
});