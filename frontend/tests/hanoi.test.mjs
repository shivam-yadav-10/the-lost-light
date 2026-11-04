import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as browser from '../src/services/hanoi.ts';
import * as reference from '../../backend/src/services/hanoi.ts';

function solution(n, from = 0, to = 2, spare = 1) {
  if (!n) return '';
  return solution(n - 1, from, spare, to) + `${from}${to}` + solution(n - 1, spare, to, from);
}

for (const [name, engine] of [['browser', browser], ['reference', reference]]) {
  test(`${name}: seven disks start on the left and require 127 legal moves to the right`, () => {
    assert.equal(engine.HANOI_DISKS, 7);
    assert.deepEqual(engine.hanoiPegs(''), [[7, 6, 5, 4, 3, 2, 1], [], []]);
    const moves = solution(7);
    assert.equal(moves.length / 2, 127);
    for (let i = 0; i < moves.length; i += 2) {
      assert.equal(engine.hanoiSolved(moves.slice(0, i)), false);
    }
    assert.deepEqual(engine.hanoiPegs(moves), [[], [], [7, 6, 5, 4, 3, 2, 1]]);
    assert.equal(engine.hanoiSolved(moves), true);
    assert.equal(engine.hanoiSolved(solution(4)), false, 'old four-disk solutions no longer unlock');
    assert.equal(engine.hanoiSolved(solution(6)), false);
    assert.equal(engine.hanoiSolved(solution(7, 0, 1, 2)), false);
    assert.equal(engine.hanoiSolved(`0110${moves}`), true, 'non-minimal solutions count');
  });

  test(`${name}: reject illegal moves and malformed or oversized histories`, () => {
    for (const moves of ['00', '10', '0101', '013', '0', 'ab', '03', '0110'.repeat(2049)]) {
      assert.throws(() => engine.hanoiPegs(moves), Error, moves);
    }
  });

  test(`${name}: submission requires a replayable solution plus a separate proof code`, () => {
    const moves = solution(7);
    assert.deepEqual(engine.parseVaultProof(JSON.stringify({ code: '123-456', moves })),
      { code: '123456', moves });
    for (const value of [undefined, '', '123456', 'null', '[]', '{}', 'true',
      JSON.stringify({ code: '123456', moves: '01', solved: true }),
      JSON.stringify({ code: 123456, moves }),
      JSON.stringify({ code: '123456', moves: [] }),
      JSON.stringify({ code: '123456', moves: '0101' })]) {
      assert.throws(() => engine.parseVaultProof(value));
    }
  });
}
