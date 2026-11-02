/**
 * `npm run answer-key`: writes ANSWER-KEY.md (git-ignored), the organiser's answer key and testing sheet.
 * Everything is generated from the content files and the team list in the database, so it never drifts.
 * Team-specific values (errand code, Five Dawns word, Convergence key / Vault proof, seals) depend on the
 * team list and GAME_SECRET, so re-run this after changing either.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { closeDb, getDb, queryAll } from '../db/connection.js';
import { PUBLIC_PUZZLES } from './public.js';
import {
  CHECKPOINTS,
  ERRAND_LOCATIONS,
  FIVE_DAWNS_SETS,
  POSTER_IMAGES,
  SHARDS,
  errandGroup,
  protectedPuzzle,
  riddleSet,
} from './protected.js';
import type { ErrandGroup, ShardType } from './types.js';
import { keeperSeal, teamKey, teamSeal } from '../services/convergence.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, '../../../ANSWER-KEY.md');
const upper = (s: string) => s.toUpperCase();
const firstSentence = (s: string) => s.split(/(?<=[.?!])\s/)[0];
const spaced = (word: string) => (word === 'BHAIDOOJ' ? 'BHAI DOOJ' : word);
const code = (s: string) => `\`${s}\``;
const title = (id: number) => PUBLIC_PUZZLES.find((p) => p.id === id)!.title;
const ist = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '—';

function aliasesSection(): string[] {
  const out = ['## Accepted answers (any of these work)', '', '| Puzzle | Accepted |', '|---|---|'];
  const accepted = (id: number) => protectedPuzzle(id).answers.map(code).join(', ');
  out.push(`| I ${title(1)} | ${accepted(1)} |`);
  out.push(`| II ${title(2)} | own group code only, with or without the dash (\`glow 7k4m\` works) |`);
  out.push(`| III ${title(3)} | ${accepted(3)} |`);
  out.push(`| IV ${title(4)} | ${accepted(4)} (a comma between the words is fine) |`);
  out.push(`| V ${title(5)} | own set's word only |`);
  out.push(`| VI ${title(6)} | ${accepted(6)} |`);
  out.push(`| VII ${title(7)} | own 6-digit key only (spaces and dashes ignored) |`);
  out.push(`| VIII ${title(8)} | word ${accepted(8)} **and** the team's own key as proof code |`);
  out.push('', 'Answers ignore case, accents and punctuation.', '');
  return out;
}

function nudgesSection(): string[] {
  const out = ['## Wrong answers that trigger a nudge (for testing messages)', '', '| Puzzle | Try | Expected message starts with |', '|---|---|---|'];
  for (const id of [1, 3, 4, 5, 6, 8]) {
    for (const n of protectedPuzzle(id).nearMisses) {
      const tries = n.answers ?? n.containsAny?.slice(0, 4) ?? [];
      const label = n.answers ? tries.map(code).join(', ') : `anything containing ${tries.map((t) => code(t.toLowerCase())).join(', ')}…`;
      out.push(`| ${title(id)} | ${label} | ${firstSentence(n.message)} |`);
    }
  }
  out.push(`| ${title(2)} | another group's code | ${firstSentence(protectedPuzzle(2).otherGroupMessage!)} |`);
  out.push(`| ${title(5)} | another set's word | ${firstSentence(protectedPuzzle(5).otherGroupMessage!)} |`);
  out.push(`| ${title(7)} | own key reversed | Light fades from violet. |`);
  out.push(`| ${title(8)} | ${code('shared')} + wrong proof | The Vault stays sealed. (never confirms the word) |`);
  out.push('');
  return out;
}

function fiveDawnsSection(): string[] {
  const out = [
    '## V The Five Dawns: every line, per set',
    '',
    '| Set | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Word |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const s of FIVE_DAWNS_SETS) out.push(`| ${s.group} | ${s.lines.map(spaced).join(' | ')} | **${s.final}** |`);
  out.push('');
  return out;
}

function codesSection(teams: { id: number; name: string }[]): string[] {
  const out = ['## Codes and seals', '', '| What | Code | Notes |', '|---|---|---|'];
  const errandCodes = Object.values(protectedPuzzle(2).answersByGroup!).flat();
  for (const c of CHECKPOINTS.filter((x) => !errandCodes.includes(x.code))) {
    out.push(`| ${c.title} | ${code(c.code)} | type in "Found a code?" |`);
  }
  for (const g of Object.keys(ERRAND_LOCATIONS) as ErrandGroup[]) {
    out.push(`| Errand card ${g} | ${code(protectedPuzzle(2).answersByGroup![g][0])} | ${ERRAND_LOCATIONS[g]}; answer to II, also works in "Found a code?" |`);
  }
  for (const s of SHARDS) out.push(`| Keeper seal ${s.type} (${s.name}) | ${code(keeperSeal(s.type as ShardType))} | deadlock fallback only |`);
  for (const t of teams) out.push(`| ${t.name}'s seal | ${code(teamSeal(t.id))} | only works once the team has opened The Convergence |`);
  out.push('', 'Poster pictures (IV): ' + POSTER_IMAGES.map((p) => `${p.poster}) ${p.word}${p.flames ? ` (${p.flames} lit)` : ''}`).join(' · '), '');
  return out;
}

function timesSection(): string[] {
  const out = ['## Unlock times and fake times', '', '| Puzzle | Opens (IST) | Fake time to test it |', '|---|---|---|'];
  for (const p of PUBLIC_PUZZLES) {
    const fake = p.unlockAt ? new Date(new Date(p.unlockAt).getTime() + 5 * 60_000).toISOString().replace('.000', '') : null;
    const opens = p.unlockAt
      ? `${ist(p.unlockAt)}${p.requires.length ? ' and I–V solved' : ''}`
      : p.kind === 'convergence'
        ? 'when I–VI are solved'
        : 'when VII is solved';
    out.push(`| ${p.title} | ${opens} | ${fake ? code(`test-server.bat --now=${fake}`) : 'any time, once unlocked'} |`);
  }
  out.push('', `Default \`test-server.bat\` time is ${code('2026-11-10T10:00:00Z')} (15:30 IST): puzzles I–V open.`, '');
  return out;
}

try {
  getDb();
  const teams = queryAll<{ id: number; name: string; game_key: string }>('SELECT id, name, game_key FROM teams ORDER BY id');

  const perTeam = teams.map((t) => {
    const key = teamKey(t.id);
    const dawns = FIVE_DAWNS_SETS.find((s) => s.group === riddleSet(t.id))!;
    return `| ${t.name} | ${code(t.game_key)} | ${upper(protectedPuzzle(1).answers[0])} | ${protectedPuzzle(2).answersByGroup![errandGroup(t.id)][0]} (${errandGroup(t.id)}) | ${upper(protectedPuzzle(3).answers[0])} | ${upper(protectedPuzzle(4).answers[0])} | ${dawns.final} (${dawns.group}) | ${upper(protectedPuzzle(6).answers[0])} | ${key} | SHARED + ${key} |`;
  });

  const markdown = [
    '# The Lost Light: Answer Key',
    '',
    '> Organiser-only. Do not share. Regenerate with `npm run answer-key` after changing teams or `GAME_SECRET`.',
    '',
    `Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · ${teams.length} teams · secret: ${process.env.GAME_SECRET ? 'GAME_SECRET from env' : 'local dev default (keys change once GAME_SECRET is set)'}`,
    '',
    '## Logins',
    '',
    '| What | Where | Key |',
    '|---|---|---|',
    `| Game (dev) | http://localhost:5173 (or the next free port) | team keys below |`,
    `| Game (fake-time test server) | printed by \`test-server.bat\` (default http://localhost:5180) | team keys below |`,
    `| Admin page | \`/#/admin\` on either | ${code(process.env.ADMIN_KEY ? 'ADMIN_KEY from env' : 'local-admin')} |`,
    '',
    '## Every team at a glance',
    '',
    '| Team | Login key | I Street | II Errand | III Darkest Day | IV Plain Sight | V Five Dawns | VI Echo | VII Convergence | VIII Vault |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...perTeam,
    '',
    'VII: the key is the six digits from the lantern. VIII: enter the word **SHARED** and the key as the proof code.',
    'Convergence shards are handed out in arrival order: 1st team A, 2nd B, 3rd C, 4th D, 5th A…',
    '',
    ...aliasesSection(),
    ...nudgesSection(),
    ...fiveDawnsSection(),
    ...codesSection(teams),
    ...timesSection(),
  ].join('\n');

  fs.writeFileSync(outFile, markdown);
  console.log(`Answer key for ${teams.length} teams written to ${outFile} (from ${config.dbPath})`);
} finally {
  closeDb();
}
