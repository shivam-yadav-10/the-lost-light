import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkConvergenceAnswer as browser } from '../src/services/convergenceAnswer.ts';
import { checkConvergenceAnswer as reference } from '../../backend/src/services/convergenceAnswer.ts';
import { CONVERGENCE_RIDDLES } from '../../backend/src/content/convergenceRiddles.ts';

for (const [name, check] of [['browser', browser], ['reference', reference]]) {
  test(`${name}: all six circle words require the overlay word in either order`, () => {
    for (const { answer } of CONVERGENCE_RIDDLES) {
      assert.equal(check(`${answer} UNITE`, answer, 'UNITE'), true);
      assert.equal(check(`  unite \n ${answer.toLowerCase()}  `, answer, 'UNITE'), true);
      for (const raw of ['', answer, 'UNITE', `${answer} ${answer}`, 'UNITE UNITE',
        `${answer} UNITE EXTRA`, `${answer}UNITE`, `${answer},UNITE`]) {
        assert.equal(check(raw, answer, 'UNITE'), false, raw);
      }
      for (const other of CONVERGENCE_RIDDLES.filter((riddle) => riddle.answer !== answer)) {
        assert.equal(check(`${other.answer} UNITE`, answer, 'UNITE'), false);
      }
    }
    assert.throws(() => check('MATCH UNITE', undefined, 'UNITE'), /missing/);
    assert.throws(() => check('MATCH UNITE', 'MATCH', undefined), /missing/);
  });
}
