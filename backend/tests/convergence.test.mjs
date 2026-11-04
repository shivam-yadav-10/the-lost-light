import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { config } from '../src/config.ts';
import { applySchema, closeDb, getDb } from '../src/db/connection.ts';
import { seed } from '../src/db/seed.ts';
import { protectedPuzzle } from '../src/content/protected.ts';
import { getConvergence, getPuzzleForTeam, getTeamProgress, submitAnswer } from '../src/services/gameEngine.ts';
import { convergenceCircle, circleRiddle, keeperSeal, teamKey, teamSeal, verifySeal } from '../src/services/convergence.ts';
import { CONVERGENCE_RIDDLES, planRiddleSets } from '../src/content/convergenceRiddles.ts';
import {
  buildOverlayCards, OVERLAY_WORD, planConvergenceGroups, wordPixels, parseAlignment,
} from '../src/services/convergenceOverlay.ts';
import { provisionConvergence } from '../src/scripts/provision-convergence.ts';

beforeEach(() => {
  config.dbPath = ':memory:';
  config.now = () => new Date('2026-11-11T00:00:00Z');
  applySchema(getDb()); seed(getDb());
});
afterEach(() => closeDb());

function reach(team) {
  for (let id = 1; id <= 6; id++) getDb().prepare(
    "INSERT OR REPLACE INTO team_progress (team_id, puzzle_id, status, hints_used) VALUES (?, ?, 'solved', 1)",
  ).run(team, id);
  return getConvergence(team);
}
const proof = (...ids) => JSON.stringify(ids.map((id) => ({ teamId: String(id), x: 0, y: 0, rotation: 0 })));

test('mutual pair seals require arrival and cannot be replaced by own, unrelated, or keeper seals', () => {
  assert.throws(() => getConvergence(1), /still hidden/);
  const first = reach(1);
  assert.deepEqual(first.partners.map((p) => p.teamId), ['2']);
  assert.equal(first.partners[0].arrived, false);
  assert.equal(first.partners[0].card, null);
  assert.equal(JSON.stringify(first).includes(teamSeal(2)), false);
  assert.throws(() => verifySeal(1, teamSeal(2)), /must reach/);
  reach(2);
  for (const seal of [teamSeal(1), teamSeal(3), keeperSeal('A'), 'not-a-seal']) {
    assert.throws(() => verifySeal(1, seal), /not from a partner/);
  }
  assert.equal(verifySeal(1, teamSeal(2).toLowerCase().replaceAll('-', ' ')).alreadyHeld, false);
  assert.equal(verifySeal(1, teamSeal(2)).alreadyHeld, true);
  assert.equal(getConvergence(1).partners[0].verified, true);
  assert.equal(getConvergence(2).partners[0].verified, false);
  verifySeal(2, teamSeal(1));
  assert.equal(getConvergence(2).partners[0].verified, true);
});

test('both words, alignment and every seal are required; Vault stays compatible', () => {
  reach(1); reach(2);
  assert.throws(() => submitAnswer(1, 7, 'MATCH UNITE', proof(2)), /Every partner/);
  assert.equal(getConvergence(1).clueIndex, 0);
  assert.equal(getConvergence(1).partners[0].clueIndex, null);
  verifySeal(1, teamSeal(2));
  assert.equal(getConvergence(1).partners[0].clueIndex, 1);
  assert.equal(getConvergence(1).partners[0].clue.art, 'tiles');
  for (const rawProof of [undefined, 'bad', proof(3), JSON.stringify([{ teamId: '2', x: 1, y: 0, rotation: 0 }])]) {
    assert.throws(() => submitAnswer(1, 7, 'MATCH UNITE', rawProof), /Align every partner/);
  }
  assert.equal(submitAnswer(1, 7, 'UNITE', proof(2)).correct, false);
  getDb().prepare("UPDATE submissions SET submitted_at = '2020-01-01T00:00:00Z'").run();
  assert.equal(submitAnswer(1, 7, 'SCALE UNITE', proof(2)).correct, false);
  getDb().prepare("UPDATE submissions SET submitted_at = '2020-01-01T00:00:00Z'").run();
  const result = submitAnswer(1, 7, '  unite   match  ', proof(2));
  assert.equal(result.correct, true);
  assert.match(result.message, new RegExp(teamKey(1)));
  assert.equal(getTeamProgress(1).puzzles[7].state, 'AVAILABLE');
  assert.throws(() => submitAnswer(1, 8, protectedPuzzle(8).answers[0], teamKey(1)), /seven-disk tower/);
  const solution = (n, from = 0, to = 2, spare = 1) => n
    ? solution(n - 1, from, spare, to) + `${from}${to}` + solution(n - 1, spare, to, from) : '';
  const moves = solution(7);
  const vaultProof = (code, history = moves) => JSON.stringify({ code, moves: history });
  assert.throws(() => submitAnswer(1, 8, protectedPuzzle(8).answers[0], vaultProof(teamKey(1), '01')),
    /seven-disk tower/);
  assert.equal(submitAnswer(1, 8, protectedPuzzle(8).answers[0], vaultProof('wrong')).correct, false);
  getDb().prepare("UPDATE submissions SET submitted_at = '2020-01-01T00:00:00Z'").run();
  assert.equal(submitAnswer(1, 8, 'wrong', vaultProof(teamKey(1))).correct, false);
  getDb().prepare("UPDATE submissions SET submitted_at = '2020-01-01T00:00:00Z'").run();
  assert.equal(submitAnswer(1, 8, protectedPuzzle(8).answers[0], vaultProof(teamKey(1))).correct, true);
});

test('odd rosters have one triple and all three participants are needed', () => {
  getDb().prepare("INSERT INTO teams (name, game_key) VALUES ('Fifth', 'FIFTH')").run();
  const first = reach(3);
  assert.deepEqual(first.partners.map((p) => p.teamId), ['4', '5']);
  reach(4); verifySeal(3, teamSeal(4));
  assert.throws(() => verifySeal(3, teamSeal(5)), /must reach/);
  assert.throws(() => submitAnswer(3, 7, `${circleRiddle(3).answer} UNITE`, proof(4, 5)), /Every partner/);
  reach(5); verifySeal(3, teamSeal(5));
  const circle = getConvergence(3);
  assert.deepEqual([circle.clueIndex, ...circle.partners.map((p) => p.clueIndex)], [0, 1, 2]);
  assert.equal(getConvergence(5).clueIndex, 2);
  assert.throws(() => submitAnswer(3, 7, `${circleRiddle(3).answer} UNITE`, proof(4)), /Align every partner/);
  assert.equal(submitAnswer(3, 7, `${circleRiddle(3).answer} UNITE`, proof(4, 5)).correct, true);
  assert.equal(getConvergence(4).partners.filter((p) => p.verified).length, 0);
});

test('progress, old solves, hint usage, and Vault proof derivation survive content reseeding', () => {
  reach(1);
  getDb().prepare("INSERT INTO team_progress (team_id, puzzle_id, status, hints_used, solved_at) VALUES (1, 7, 'solved', 2, '2026-11-01T10:00:00Z')").run();
  const old = getTeamProgress(1);
  const key = teamKey(1);
  seed(getDb());
  assert.deepEqual(getTeamProgress(1).puzzles, old.puzzles);
  assert.equal(getPuzzleForTeam(1, 7).hintsUsed, 2);
  assert.equal(reach(2).partners[0].arrived, true);
  assert.equal(teamKey(1), key);
});

test('persisted circles survive newly added teams; a lone addition never silently repairs existing circles', () => {
  assert.deepEqual(convergenceCircle(1), ['1', '2']);
  getDb().prepare("INSERT INTO teams (name, game_key) VALUES ('Fifth', 'FIFTH')").run();
  assert.deepEqual(convergenceCircle(1), ['1', '2']);
  assert.throws(() => convergenceCircle(5), /One unassigned team/);
  getDb().prepare("INSERT INTO teams (name, game_key) VALUES ('Sixth', 'SIXTH')").run();
  assert.deepEqual(convergenceCircle(1), ['1', '2']);
  assert.deepEqual(convergenceCircle(5), ['5', '6']);
});

test('pairing validates mutual persisted assignments, odd/even sizes, and roster integrity', () => {
  for (let count = 2; count <= 31; count++) {
    const teams = Array.from({ length: count }, (_, i) => ({ id: `t${i}`, teamNumber: i + 1 }));
    const groups = planConvergenceGroups(teams, new Map());
    assert.equal(groups.flat().length, count);
    assert.equal(groups.filter((g) => g.length === 3).length, count % 2);
    assert.equal(new Set(groups.flat()).size, count);
    const existing = new Map(groups.flatMap((group) => group.map((id) => [id, { version: 2, memberIds: group }])));
    assert.deepEqual(planConvergenceGroups([...teams].reverse(), existing), groups);
    existing.delete('t0');
    assert.throws(() => planConvergenceGroups(teams, existing), /Invalid or incomplete/);
  }
  assert.throws(() => planConvergenceGroups([{ id: 'a', teamNumber: 1 }, { id: 'b', teamNumber: 1 }], new Map()), /unique/);
});

test('legacy persisted masks remain unchanged for non-destructive provisioning', () => {
  const dark = wordPixels();
  assert.equal(OVERLAY_WORD, 'UNITE');
  const top = [...Array(31)].map((_, x) => dark.has(31 + x) ? '#' : '.').join('');
  assert.equal(top, '.#...#.#...#.#####.#####.#####.');
  for (let sample = 0; sample < 30; sample++) for (const size of [2, 3]) {
    const ids = Array.from({ length: size }, (_, i) => `team-${sample}-${i}`);
    const cards = buildOverlayCards(ids);
    assert.deepEqual(buildOverlayCards(ids), cards);
    const allLit = cards.flatMap((card) => card.lit);
    assert.equal(new Set(allLit).size, allLit.length);
    assert.equal(allLit.length + dark.size, 31 * 9);
    assert.ok(allLit.every((pixel) => !dark.has(pixel)));
    for (let omit = 0; omit < size; omit++) {
      const partial = new Set(cards.filter((_, i) => i !== omit).flatMap((card) => card.lit));
      assert.ok(partial.size < allLit.length - 20);
      assert.ok(cards[omit].lit.some((pixel) => dark.has(pixel + 1)));
      const rotated = new Set(cards[omit].lit.map((pixel) => 278 - pixel));
      assert.ok([...rotated].some((pixel) => dark.has(pixel)));
    }
  }
});

test('six distinct sets are stable per circle and never silently reused or reassigned', () => {
  const groups = Array.from({ length: 6 }, (_, i) => [`a${i}`, `b${i}`]);
  const sets = planRiddleSets(groups, new Map());
  assert.equal(new Set(groups.map(([id]) => sets.get(id))).size, 6);
  assert.equal(new Set(CONVERGENCE_RIDDLES.map((riddle) => riddle.answer)).size, 6);
  for (const group of groups) assert.equal(sets.get(group[0]), sets.get(group[1]));
  assert.deepEqual(planRiddleSets([...groups].reverse(), sets), sets);
  assert.throws(() => planRiddleSets([...groups, ['extra1', 'extra2']], sets), /Only six/);
  const corrupt = new Map(sets);
  corrupt.set('a0', 'C6');
  assert.throws(() => planRiddleSets(groups, corrupt), /Inconsistent/);
  const duplicate = new Map(sets);
  duplicate.set('a1', 'C1'); duplicate.set('b1', 'C1');
  assert.throws(() => planRiddleSets(groups, duplicate), /duplicate/);
  const first = reach(1);
  const second = reach(3);
  assert.notDeepEqual(first.clue, second.clue);
  const saved = circleRiddle(1).id;
  assert.equal(circleRiddle(2).id, saved);
  seed(getDb());
  assert.equal(circleRiddle(1).id, saved);
});

test('alignment parser rejects duplicate, incomplete, nonfinite, and foreign placements', () => {
  const members = ['a', 'b', 'c'];
  const aligned = [{ teamId: 'b', x: 0, y: 0, rotation: 360 }, { teamId: 'c', x: 0, y: 0, rotation: 0 }];
  assert.deepEqual(parseAlignment(JSON.stringify(aligned), members, 'a'), aligned);
  for (const value of [null, {}, [], [aligned[0]], [aligned[0], aligned[0]],
    [aligned[0], { ...aligned[1], rotation: null }], [aligned[0], { ...aligned[1], x: '0' }],
    [aligned[0], { ...aligned[1], teamId: 'a' }]]) {
    assert.throws(() => parseAlignment(JSON.stringify(value), members, 'a'));
  }
});

function fakeFirestore(count) {
  const data = new Map();
  for (let i = 1; i <= count; i++) {
    data.set(`teams/t${i}`, { teamName: `Team ${i}`, teamNumber: i, assignedUids: ['keep-login'], introSeenAt: 'keep-intro' });
    data.set(`privateTeamData/t${i}`, { lanternKey: `${i}`.padStart(6, '0'), other: 'keep' });
    data.set(`teams/t${i}/progress/7`, { status: 'solved', hintsUsed: 2, solvedAt: 'keep-time' });
  }
  data.set('teamPuzzleContent/t1_6', { blocks: ['keep-courtyard'] });
  data.set('gameConfig/main', { unlockOverrides: { 1: 'keep-override' } });
  let commits = 0;
  const snap = (path) => ({
    id: path.split('/').at(-1), ref: { path }, exists: data.has(path),
    data: () => structuredClone(data.get(path)), get: (key) => structuredClone(data.get(path)?.[key]),
  });
  const firestore = {
    doc: (path) => ({ path }),
    collection: () => ({ get: async () => ({ docs: [...data.keys()].filter((path) => /^teams\/[^/]+$/.test(path)).map(snap) }) }),
    getAll: async (...refs) => refs.map((ref) => snap(ref.path)),
    batch: () => {
      const pending = [];
      return {
        set: (ref, value) => pending.push([ref.path, value]),
        commit: async () => {
          commits++;
          for (const [path, value] of pending) data.set(path, { ...data.get(path), ...structuredClone(value) });
        },
      };
    },
  };
  return { firestore, data, commits: () => commits };
}

test('targeted Firestore provisioning is dry-run safe, idempotent and preserves all progress/logins/other content/old proofs', async () => {
  const fake = fakeFirestore(5);
  const before = structuredClone(fake.data);
  await provisionConvergence(fake.firestore, false);
  assert.deepEqual(fake.data, before);
  assert.equal(fake.commits(), 0);
  await provisionConvergence(fake.firestore, true);
  for (const [path, value] of before) assert.deepEqual(fake.data.get(path), value, path);
  const first = structuredClone(fake.data);
  await provisionConvergence(fake.firestore, true);
  assert.deepEqual(fake.data, first);
  const circles = new Map();
  for (let i = 1; i <= 5; i++) {
    const assignment = fake.data.get(`teamGameData/t${i}`).convergence;
    circles.set(`t${i}`, assignment);
    assert.ok(CONVERGENCE_RIDDLES.some((riddle) => riddle.id === assignment.riddleSet));
    assert.ok(assignment.clue.art);
    assert.ok(fake.data.get(`teams/t${i}/puzzleRewards/7`).completionMessage.includes(`${i}`.padStart(6, '0')));
    assert.equal(fake.data.has(`teams/t${i}/convergence/arrival`), false);
    assert.equal(fake.data.has(`teams/t${i}/convergenceSeals/t1`), false);
  }
  assert.equal(planConvergenceGroups(Array.from({ length: 5 }, (_, i) => ({ id: `t${i + 1}`, teamNumber: i + 1 })), circles).length, 2);
});

test('invalid partial assignments and single-team rosters abort targeted provisioning before any writes', async () => {
  const single = fakeFirestore(1);
  await assert.rejects(() => provisionConvergence(single.firestore, true), /One unassigned team/);
  assert.equal(single.commits(), 0);
  const broken = fakeFirestore(4);
  broken.data.set('teamGameData/t1', { convergence: { version: 2, memberIds: ['t1', 't2'] } });
  await assert.rejects(() => provisionConvergence(broken.firestore, true), /Invalid or incomplete/);
  assert.equal(broken.commits(), 0);
});

test('persisted mask corruption aborts reseeding rather than silently changing the puzzle', async () => {
  const fake = fakeFirestore(4);
  await provisionConvergence(fake.firestore, true);
  fake.data.get('teamGameData/t1').convergence.card.lit.pop();
  const before = structuredClone(fake.data);
  const commits = fake.commits();
  await assert.rejects(() => provisionConvergence(fake.firestore, true), /Persisted masks/);
  assert.deepEqual(fake.data, before);
  assert.equal(fake.commits(), commits);
});

test('upgrading old circles adds distinct riddles without replacing masks, seals, keys or solves', async () => {
  const fake = fakeFirestore(4);
  await provisionConvergence(fake.firestore, true);
  for (let i = 1; i <= 4; i++) {
    const old = fake.data.get(`teamGameData/t${i}`).convergence;
    delete old.riddleSet; delete old.clue;
  }
  const before = structuredClone(fake.data);
  await provisionConvergence(fake.firestore, true);
  for (let i = 1; i <= 4; i++) {
    const assignment = fake.data.get(`teamGameData/t${i}`).convergence;
    const { riddleSet, clue, ...preserved } = assignment;
    assert.deepEqual(preserved, before.get(`teamGameData/t${i}`).convergence);
    assert.deepEqual(fake.data.get(`privateTeamData/t${i}`), before.get(`privateTeamData/t${i}`));
    assert.deepEqual(fake.data.get(`teams/t${i}/progress/7`), before.get(`teams/t${i}/progress/7`));
    assert.ok(clue.text);
    assert.equal(riddleSet, i <= 2 ? 'C1' : 'C2');
  }
  const tooMany = fakeFirestore(14);
  await assert.rejects(() => provisionConvergence(tooMany.firestore, true), /Only six/);
  assert.equal(tooMany.commits(), 0);
});

test('adding a second odd batch cannot create extra triples or silently change existing partners', () => {
  const teams = Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, teamNumber: i + 1 }));
  const group = teams.map((team) => team.id);
  const existing = new Map(group.map((id) => [id, { version: 2, memberIds: group }]));
  const additions = Array.from({ length: 3 }, (_, i) => ({ id: `new${i}`, teamNumber: i + 4 }));
  assert.throws(() => planConvergenceGroups([...teams, ...additions], existing), /persisted triple/);
  assert.deepEqual(planConvergenceGroups([...teams, ...additions.slice(0, 2)], existing), [group, ['new0', 'new1']]);
});
