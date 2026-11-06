import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesMelody, pianoUnlocked, PIANO_KEYS, PIANO_VERSION, teamMelody } from '../src/services/piano.ts';

test('all 12 final teams and four retained test teams have separate stable eight-note melodies', () => {
  const teams = [...Array.from({ length: 12 }, (_, i) => `TEAM-${String(i + 1).padStart(3, '0')}`),
    ...Array.from({ length: 4 }, (_, i) => `LOCAL-TEST-${i + 1}`)];
  const melodies = teams.map(teamMelody);
  assert.equal(new Set(melodies.map((melody) => melody.join(''))).size, 16);
  teams.forEach((id, index) => {
    assert.deepEqual(teamMelody(id), melodies[index]);
    assert.equal(melodies[index].length, 8);
    assert.ok(melodies[index].every((key) => PIANO_KEYS.includes(key)));
    assert.equal(matchesMelody(id, melodies[index]), true);
    assert.equal(matchesMelody(id, melodies[(index + 1) % teams.length]), false);
  });
});

test('melody validation rejects partial, extra, reordered and invalid notes', () => {
  const melody = teamMelody('TEAM-001');
  for (const invalid of [null, {}, melody.join(''), melody.slice(1), [...melody, 'A'],
    ['X', ...melody.slice(1)], [...melody].reverse()]) {
    assert.equal(matchesMelody('TEAM-001', invalid), false);
  }
  assert.throws(() => teamMelody(' '), /identity/);
});

test('melody completion survives refresh via progress but is invalidated by a reset; solved teams remain solved', () => {
  assert.equal(pianoUnlocked({}), false);
  assert.equal(pianoUnlocked({ pianoVersion: PIANO_VERSION }), true);
  assert.equal(pianoUnlocked({ pianoVersion: 0 }), false);
  assert.equal(pianoUnlocked({ status: 'solved' }), true);
  assert.equal(pianoUnlocked({ status: 'available' }), false);
});
