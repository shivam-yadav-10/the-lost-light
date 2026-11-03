/**
 * Content consistency checker: `npm run content:check`.
 * Re-derives every answer from the content files and verifies the design invariants listed in
 * docs/testing-guide.md. Exits non-zero on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIVE_DAWNS_RIDDLES, PUBLIC_PUZZLES, STREET_LAMPS, STREET_RANGOLI } from './public.js';
import {
  CHECKPOINTS,
  ERRAND_GROUPS,
  FIVE_DAWNS_SETS,
  POSTER_IMAGES,
  PROTECTED_PUZZLES,
  RAINBOW,
  errandGroup,
  protectedPuzzle,
  riddleSet,
} from './protected.js';
import {
  MIRROR_EAST_WEST,
  buildLantern,
  keeperSeal,
  lanternTargets,
  readKey,
  teamKey,
  teamSeal,
} from '../services/convergence.js';
import { normaliseAnswer } from '../services/normalise.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures++;
}

const canonical = (id: number) => normaliseAnswer(protectedPuzzle(id).answers[0]);
const nearMissFor = (id: number, answer: string) =>
  protectedPuzzle(id).nearMisses.some(
    (n) => n.answers?.some((a) => normaliseAnswer(a) === answer) || n.containsAny?.some((w) => answer.includes(normaliseAnswer(w))),
  );

// ---------- I. The Festival Street ----------
const lit = STREET_LAMPS.filter((l) => l.lit).sort((a, b) => a.x - b.x);
check('Street has exactly five lit lamps', lit.length === 5);
check('Street has unlit decoy lamps', STREET_LAMPS.some((l) => !l.lit));
check('Lamp x positions are distinct (left-to-right order is unambiguous)', new Set(STREET_LAMPS.map((l) => l.x)).size === STREET_LAMPS.length);
check(
  'Lamps sit inside the 1200 × 720 scene',
  STREET_LAMPS.every((l) => l.x > 10 && l.x < 1190 && l.y > 10 && l.y < 710),
);
const streetWord = lit.map((l) => l.letter).join('');
check('Lit lamps, left to right, spell the answer', streetWord.toLowerCase() === canonical(1), streetWord);

// ---------- II. The Errand ----------
const errand = protectedPuzzle(2);
const errandCodes = ERRAND_GROUPS.map((g) => errand.answersByGroup?.[g]?.[0] ?? '');
check('Each errand group has its own code', errandCodes.every(Boolean) && new Set(errandCodes).size === 3, errandCodes.join(', '));
const errandPuzzle = PUBLIC_PUZZLES.find((p) => p.id === 2)!;
check('Each errand group has its own riddle', ERRAND_GROUPS.every((g) => (errandPuzzle.variants?.[g]?.length ?? 0) > 0));
const groupCounts = ERRAND_GROUPS.map((g) => Array.from({ length: 15 }, (_, i) => errandGroup(i + 1)).filter((x) => x === g).length);
check('15 teams spread evenly across errand groups', Math.max(...groupCounts) - Math.min(...groupCounts) <= 1, groupCounts.join('/'));
check(
  'Every errand code is also a claimable checkpoint',
  errandCodes.every((code) => CHECKPOINTS.some((c) => c.code === code && c.puzzleId === 2)),
);

// ---------- III. The Darkest Day ----------
const darkest = protectedPuzzle(3);
check(
  'Darkest Day near misses never collide with accepted answers',
  darkest.answers.every((a) => !darkest.nearMisses.some((n) => n.answers?.map(normaliseAnswer).includes(normaliseAnswer(a)))),
);
const darkestText = JSON.stringify(PUBLIC_PUZZLES.find((p) => p.id === 3)!.blocks).toLowerCase();
check('Darkest Day story never says it was night', !/\bnight\b/.test(darkestText));

// ---------- IV. Hidden in Plain Sight ----------
const truePosters = POSTER_IMAGES.filter((p) => p.flames > 0).sort((a, b) => a.flames - b.flames);
check('Exactly two posters show a lit diya (1 and 2 flames)', truePosters.map((p) => p.flames).join() === '1,2');
check('Six posters in total', POSTER_IMAGES.length === 6);
const posterAnswer = truePosters.map((p) => p.word).join(' ').toLowerCase();
check('Poster words in flame order give the answer', posterAnswer === canonical(4), posterAnswer);
check('Reversed order gets the "count the flames" nudge', nearMissFor(4, truePosters.map((p) => p.word).reverse().join(' ').toLowerCase()));
check(
  'Every decoy word triggers the false-light nudge',
  POSTER_IMAGES.filter((p) => p.flames === 0).every((p) => nearMissFor(4, p.word.toLowerCase())),
);

// ---------- V. The Five Dawns ----------
const finals = FIVE_DAWNS_SETS.map((s) => s.final);
check('Six riddle sets with six different final words', FIVE_DAWNS_SETS.length === 6 && new Set(finals).size === 6, finals.join(', '));
for (const set of FIVE_DAWNS_SETS) {
  const lines = FIVE_DAWNS_RIDDLES[set.group] ?? [];
  const lengthsOk = lines.length === 5 && lines.every((l, i) => l.lengths.reduce((a, b) => a + b, 0) === set.lines[i].length);
  check(`Set ${set.group}: five riddles whose letter boxes match the answers`, lengthsOk);
  const word = lines.map((l, i) => set.lines[i][l.mark - 1] ?? '?').join('');
  check(`Set ${set.group}: marked letters spell ${set.final}`, word === set.final, word);
  check(`Set ${set.group}: final word is accepted only for this set`, protectedPuzzle(5).answersByGroup?.[set.group]?.[0] === set.final);
}
const setCounts = FIVE_DAWNS_SETS.map((s) => Array.from({ length: 15 }, (_, i) => riddleSet(i + 1)).filter((g) => g === s.group).length);
check('15 teams spread evenly across riddle sets', Math.max(...setCounts) - Math.min(...setCounts) <= 1, setCounts.join('/'));
check('Typing a single day answer gets the "marked letters" nudge', nearMissFor(5, 'narakasura') && nearMissFor(5, 'bhai dooj'));
check('No final word is also a single day answer', finals.every((f) => !FIVE_DAWNS_SETS.some((s) => s.lines.includes(f))));

// ---------- VI. The Lantern Courtyard ----------
function permutations<T>(values: T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map((tail) => [value, ...tail]),
  );
}
const arrangements = permutations(['lotus', 'star', 'leaf', 'bell', 'moon']).filter((gates) => {
  const at = (lantern: string) => gates.indexOf(lantern);
  return at('lotus') === at('leaf') + 2
    && at('star') === at('bell') + 1
    && at('moon') > 0 && at('moon') < 4
    && at('moon') < at('bell');
});
check('Courtyard clues have one unique lantern arrangement',
  arrangements.length === 1 && arrangements[0].join(' ') === 'leaf moon lotus bell star',
  arrangements.map((gates) => gates.join(' ')).join('; '));
check('Courtyard answer key matches the solved lantern and mirror arrangement',
  canonical(6) === 'courtyard-v2 leaf moon lotus bell star slash backslash slash slash backslash backslash slash slash backslash backslash', canonical(6));
check('Rangoli has 8 spokes × 5 rings', STREET_RANGOLI.length === 40);

// ---------- The False Flame's metadata is a coherent reflection ----------
const ff = protectedPuzzle(5);
check('False fragment colour is not a rainbow colour', !RAINBOW.includes(ff.fragment!.colour));
check('False fragment direction mirrors to the true one', MIRROR_EAST_WEST[ff.fragment!.direction] === ff.trueFragment!.direction);
check('False fragment keyword reverses to the true one', [...ff.fragment!.keyword].reverse().join('') === ff.trueFragment!.keyword);
const trueColours = PROTECTED_PUZZLES.filter((p) => p.fragment).map((p) => (p.trueFragment ?? p.fragment!).colour);
check('True colours are exactly the six rainbow colours', [...trueColours].sort().join() === [...RAINBOW].sort().join());
const shownColours = PROTECTED_PUZZLES.filter((p) => p.fragment).map((p) => p.fragment!.colour);
check('The missing shown colour is the false flame\'s true colour', RAINBOW.filter((c) => !shownColours.includes(c)).join() === ff.trueFragment!.colour);

// ---------- VIII. The Final Vault ----------
/** Letters in rainbow order. Slots are fixed by TRUE colour; `useTruth` picks true vs shown keyword/number. */
function vaultWord(useTruth: boolean): string {
  return RAINBOW.map((colour) => {
    const p = PROTECTED_PUZZLES.find((x) => x.fragment && (x.trueFragment ?? x.fragment).colour === colour)!;
    const f = useTruth ? (p.trueFragment ?? p.fragment!) : p.fragment!;
    return f.keyword[f.number - 1];
  }).join('');
}
check('Vault word (true fragments, rainbow order) is the answer', vaultWord(true).toLowerCase() === canonical(8), vaultWord(true));
const naive = vaultWord(false);
check('Uncorrected Vault word is the SHADED trap with a near miss', nearMissFor(8, naive.toLowerCase()), naive);

// ---------- VII. The Convergence ----------
const targets = lanternTargets();
check('Lantern targets are six distinct cells', new Set(targets.map((t) => `${t.spoke}:${t.ring}`)).size === 6);
check('Key order is violet → red', targets.map((t) => t.colour).join() === [...RAINBOW].reverse().join());
const ids = Array.from({ length: 30 }, (_, i) => i + 1);
const keys = ids.map(teamKey);
check('30 sample teams have 30 distinct keys', new Set(keys).size === keys.length);
let marksOk = true;
let variantsOk = true;
for (const id of ids) {
  const cells = buildLantern(id);
  for (const t of targets) {
    if (cells.find((c) => c.spoke === t.spoke && c.ring === t.ring)!.mark !== t.symbol) marksOk = false;
  }
  const heartCounted = targets.map((t) => ({ ...t, ring: 6 - t.ring }));
  const unmirrored = targets.map((t) => (t.puzzleId === 5 ? { ...t, spoke: MIRROR_EAST_WEST[t.spoke] } : t));
  const variants = [readKey(cells, heartCounted), readKey(cells, unmirrored), readKey(cells, targets, (c) => c.flame)];
  if (variants.includes(teamKey(id))) variantsOk = false;
}
check('Every target cell bears its fragment mark', marksOk);
check('Wrong-rule variants never give the real key', variantsOk);
const seals = [...ids.map(teamSeal), ...(['A', 'B', 'C', 'D'] as const).map(keeperSeal)];
check('Seals are unique', new Set(seals).size === seals.length);


// ---------- uniqueness & leaks ----------
const allAnswers = PROTECTED_PUZZLES.flatMap((p) => p.answers.map(normaliseAnswer));
check('Answers are unique across puzzles', new Set(allAnswers).size === allAnswers.length);
const codes = CHECKPOINTS.map((c) => normaliseAnswer(c.code));
check('Checkpoint codes are unique', new Set(codes).size === codes.length);

// Only canonical answers, codes and hidden words are scanned. Short aliases such as "day" are ordinary words.
// "ember" is also the name of the site's colour palette (btn-ember etc.), so it cannot be scanned for in the frontend.
const DESIGN_TOKENS = new Set(['ember']);
const secrets = [
  ...PROTECTED_PUZZLES.filter((p) => p.answers.length > 0).map((p) => p.answers[0]),
  ...ERRAND_GROUPS.map((g) => protectedPuzzle(2).answersByGroup![g][0]),
  ...CHECKPOINTS.map((c) => c.code),
  ...PROTECTED_PUZZLES.flatMap((p) => (p.trueFragment ? [p.trueFragment.keyword] : [])),
  ...truePosters.map((p) => p.word),
  ...finals,
].map((s) => s.toLowerCase());
const pattern = (s: string) => new RegExp(`\\b${s.replace(/[-\s]/g, '[-\\s]?')}\\b`);
const publicText = fs.readFileSync(path.join(here, 'public.ts'), 'utf8').toLowerCase();
const leaksInPublic = secrets.filter((s) => pattern(s).test(publicText));
check('public.ts contains no answers, codes or hidden words', leaksInPublic.length === 0, leaksInPublic.join(', '));

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx?|css|html)$/.test(e.name) ? [path.join(dir, e.name)] : [],
  );
}
const frontendSrc = path.resolve(here, '../../../frontend/src');
// "marigold" alone is a palette colour and appears in decorative components; only the full answer is scanned for.
const FRONTEND_TOKENS = new Set([...DESIGN_TOKENS, 'marigold']);
if (fs.existsSync(frontendSrc)) {
  const leaks: string[] = [];
  for (const file of walk(frontendSrc)) {
    const text = fs.readFileSync(file, 'utf8').toLowerCase();
    for (const s of secrets) {
      if (!FRONTEND_TOKENS.has(s) && pattern(s).test(text)) leaks.push(`${path.basename(file)}: ${s}`);
    }
  }
  check('frontend/src contains no answers or codes', leaks.length === 0, leaks.join(', '));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
