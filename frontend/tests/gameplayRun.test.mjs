import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMEPLAY_RUN, resetPreviousRunStorage } from '../src/services/gameplayRun.ts';

function storage(values) {
  const data = new Map(Object.entries(values));
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test('new production test clears old team sessions, courtyard/riddle drafts and queued moves, not unrelated data', () => {
  const local = storage({
    'lostlight.session': 'old team', 'lostlight.riddles.1': 'answers',
    'lostlight.courtyard-v3.layout-v1.team': 'layout', unrelated: 'preserve',
  });
  const session = storage({ 'lostlight.hanoi.team': 'old queue', unrelated: 'preserve' });
  resetPreviousRunStorage(local, session);
  assert.equal(local.getItem('lostlight.session'), null);
  assert.equal(local.getItem('lostlight.riddles.1'), null);
  assert.equal(local.getItem('lostlight.courtyard-v3.layout-v1.team'), null);
  assert.equal(session.getItem('lostlight.hanoi.team'), null);
  assert.equal(local.getItem('unrelated'), 'preserve');
  assert.equal(session.getItem('unrelated'), 'preserve');
  assert.equal(local.getItem('lostlight.run'), GAMEPLAY_RUN);
  assert.equal(session.getItem('lostlight.run'), GAMEPLAY_RUN);
  local.setItem('lostlight.session', 'new team');
  session.setItem('lostlight.hanoi.team', 'new moves');
  resetPreviousRunStorage(local, session);
  assert.equal(local.getItem('lostlight.session'), 'new team');
  assert.equal(session.getItem('lostlight.hanoi.team'), 'new moves');
});

test('each tab clears its legacy session queue even if another tab already reset shared localStorage', () => {
  const local = storage({ 'lostlight.run': GAMEPLAY_RUN, 'lostlight.session': 'new team' });
  const tab = storage({ 'lostlight.hanoi.team': 'old moves' });
  resetPreviousRunStorage(local, tab);
  assert.equal(tab.getItem('lostlight.hanoi.team'), null);
  assert.equal(local.getItem('lostlight.session'), 'new team');
});
