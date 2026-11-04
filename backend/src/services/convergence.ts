import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { getDb, queryAll, queryOne, transaction } from '../db/connection.js';
import { PROTECTED_PUZZLES, RAINBOW, SHARDS } from '../content/protected.js';
import { SPOKES, type ShardContent, type ShardType, type Spoke, type SymbolName } from '../content/types.js';
import { HttpError } from '../types.js';
import { buildOverlayCards, parseAlignment, planConvergenceGroups, type ConvergenceAssignment } from './convergenceOverlay.js';
import { CONVERGENCE_RIDDLES, planRiddleSets } from '../content/convergenceRiddles.js';

/**
 * The Convergence: team-specific lanterns, keys and unforgeable shard seals.
 * Everything is derived from GAME_SECRET + team id, so nothing secret needs storing and the
 * values are stable across restarts. Changing GAME_SECRET mid-game changes every key and seal.
 */

const SHARD_ORDER: ShardType[] = ['A', 'B', 'C', 'D'];
const SYMBOLS: SymbolName[] = ['star', 'crescent', 'diamond', 'ring', 'flame', 'spiral'];
const SEAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RINGS = 5;
const SEAL_MAX_FAILS = 10;
const SEAL_WINDOW_MS = 10 * 60_000;

export const MIRROR_EAST_WEST: Record<Spoke, Spoke> = {
  N: 'N', NE: 'NW', E: 'W', SE: 'SW', S: 'S', SW: 'SE', W: 'E', NW: 'NE',
};

export interface LanternCell {
  spoke: Spoke;
  /** 1 = nearest the centre (geometry only; players count from the rim per shard B). */
  ring: number;
  flame: number;
  shadow: number;
  mark: SymbolName;
}

export interface LanternTarget {
  colour: string;
  puzzleId: number;
  spoke: Spoke;
  ring: number;
  symbol: SymbolName;
}

function hmac(label: string): Buffer {
  return createHmac('sha256', config.gameSecret).update(label).digest();
}

/** Small deterministic PRNG (mulberry32) seeded from an HMAC. */
function prng(seed: Buffer): () => number {
  let a = seed.readUInt32BE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The six cells a correct solver reads, in key order (violet → red, shard A).
 * Uses each fragment's TRUE values (shard C) and counts rings from the rim (shard B).
 */
export function lanternTargets(): LanternTarget[] {
  return PROTECTED_PUZZLES.filter((p) => p.fragment)
    .map((p) => {
      const truth = p.trueFragment ?? p.fragment!;
      return {
        colour: truth.colour,
        puzzleId: p.id,
        spoke: truth.direction,
        ring: RINGS + 1 - truth.number,
        symbol: truth.symbol,
      };
    })
    .sort((a, b) => RAINBOW.indexOf(b.colour) - RAINBOW.indexOf(a.colour));
}

export function buildLantern(teamId: number): LanternCell[] {
  const rand = prng(hmac(`lantern:${teamId}`));
  const cells: LanternCell[] = [];
  for (let ring = 1; ring <= RINGS; ring++) {
    for (const spoke of SPOKES) {
      cells.push({
        spoke,
        ring,
        flame: Math.floor(rand() * 10),
        shadow: Math.floor(rand() * 10),
        mark: SYMBOLS[Math.floor(rand() * SYMBOLS.length)],
      });
    }
  }
  for (const target of lanternTargets()) {
    const cell = cells.find((c) => c.spoke === target.spoke && c.ring === target.ring)!;
    cell.mark = target.symbol;
  }
  separateFromMisreadings(cells);
  return cells;
}

/** The three classic mistakes (from shards B, C, D) must never produce the real key. */
function misreadingTargets(): LanternTarget[][] {
  const targets = lanternTargets();
  const falseFlameId = PROTECTED_PUZZLES.find((p) => p.trueFragment)?.id;
  return [
    targets.map((t) => ({ ...t, ring: RINGS + 1 - t.ring })), // rings counted from the heart (ignoring B)
    targets.map((t) => (t.puzzleId === falseFlameId ? { ...t, spoke: MIRROR_EAST_WEST[t.spoke] } : t)), // ignoring C
  ];
}

export function misreadingKeys(cells: LanternCell[]): string[] {
  const targets = lanternTargets();
  return [...misreadingTargets().map((m) => readKey(cells, m)), readKey(cells, targets, (c) => c.flame)];
}

/** Deterministically nudges a misread (never a target) cell until no misreading equals the real key. */
function separateFromMisreadings(cells: LanternCell[]): void {
  const targets = lanternTargets();
  const at = (t: LanternTarget) => cells.find((c) => c.spoke === t.spoke && c.ring === t.ring)!;
  const variants = misreadingTargets();
  for (let attempt = 0; attempt < 20; attempt++) {
    const key = readKey(cells, targets);
    const clash = misreadingKeys(cells).indexOf(key);
    if (clash === -1) return;
    if (clash < variants.length) {
      // The first cell where this misreading differs from the true reading is not a target cell.
      const index = variants[clash].findIndex((v, i) => v.spoke !== targets[i].spoke || v.ring !== targets[i].ring);
      const cell = at(variants[clash][index]);
      cell.shadow = (cell.shadow + 1) % 10;
    } else {
      // Flame-only equals the key only when every target shadow digit is 0.
      const cell = at(targets[0]);
      cell.shadow = (cell.shadow + 1) % 10;
    }
  }
}

export function readKey(cells: LanternCell[], targets: LanternTarget[], digit = (c: LanternCell) => (c.flame + c.shadow) % 10): string {
  return targets
    .map((t) => digit(cells.find((c) => c.spoke === t.spoke && c.ring === t.ring)!))
    .join('');
}

/** The team's six-digit key: the Convergence answer and the Vault proof code. */
export function teamKey(teamId: number): string {
  return readKey(buildLantern(teamId), lanternTargets());
}

function sealFromLabel(label: string): string {
  const bytes = hmac(label);
  let out = '';
  for (let i = 0; i < 8; i++) out += SEAL_ALPHABET[bytes[i] % SEAL_ALPHABET.length];
  return `SEAL-${out.slice(0, 4)}-${out.slice(4)}`;
}

export const teamSeal = (teamId: number) => sealFromLabel(`seal:${teamId}`);
/** Organiser-only seals for the deadlock safeguard (see organizer-runbook.md). */
export const keeperSeal = (type: ShardType) => sealFromLabel(`keeper:${type}`);

function normaliseSeal(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function shardContent(type: ShardType): ShardContent {
  return SHARDS.find((s) => s.type === type)!;
}

// ---------- persistence ----------

/** Assigns shard types in arrival order (A, B, C, D, A, …) so the first four arrivals hold all four. */
export function ensureShard(teamId: number): ShardType {
  const db = getDb();
  const existing = queryOne<{ shard_type: ShardType }>('SELECT shard_type FROM convergence_shards WHERE team_id = ?', teamId);
  if (existing) return existing.shard_type;
  const { n } = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM convergence_shards')!;
  const type = SHARD_ORDER[n % SHARD_ORDER.length];
  db.prepare('INSERT INTO convergence_shards (team_id, shard_type) VALUES (?, ?)').run(teamId, type);
  db.prepare('INSERT OR IGNORE INTO convergence_verified (team_id, shard_type) VALUES (?, ?)').run(teamId, type);
  return type;
}

export function verifiedShards(teamId: number): ShardContent[] {
  return queryAll<{ shard_type: ShardType }>(
    'SELECT shard_type FROM convergence_verified WHERE team_id = ? ORDER BY shard_type',
    teamId,
  ).map((r) => shardContent(r.shard_type));
}

export function verifyShardSealLegacy(teamId: number, rawSeal: string) {
  if (typeof rawSeal !== 'string' || rawSeal.length === 0 || rawSeal.length > 40) {
    throw new HttpError(400, 'That is not a seal.');
  }
  const db = getDb();
  const { fails } = queryOne<{ fails: number }>(
    'SELECT COUNT(*) AS fails FROM seal_attempts WHERE team_id = ? AND ok = 0 AND attempted_at > ?',
    teamId,
    new Date(Date.now() - SEAL_WINDOW_MS).toISOString(),
  )!;
  if (fails >= SEAL_MAX_FAILS) {
    throw new HttpError(429, 'Too many false seals. The lantern will not listen for a while.');
  }

  const wanted = normaliseSeal(rawSeal);
  let type: ShardType | undefined = SHARD_ORDER.find((t) => normaliseSeal(keeperSeal(t)) === wanted);
  if (!type) {
    const holders = queryAll<{ team_id: number; shard_type: ShardType }>('SELECT team_id, shard_type FROM convergence_shards');
    type = holders.find((h) => normaliseSeal(teamSeal(h.team_id)) === wanted)?.shard_type;
  }
  db.prepare('INSERT INTO seal_attempts (team_id, ok) VALUES (?, ?)').run(teamId, type ? 1 : 0);
  if (!type) throw new HttpError(404, 'That seal is false, or belongs to no one yet.');

  const result = db
    .prepare('INSERT OR IGNORE INTO convergence_verified (team_id, shard_type) VALUES (?, ?)')
    .run(teamId, type);
  return { shard: shardContent(type), alreadyHeld: result.changes === 0 };
}

export function convergenceCircle(teamId: number): string[] {
  const teams = queryAll<{ id: number }>('SELECT id FROM teams ORDER BY id')
    .map((team) => ({ id: String(team.id), teamNumber: team.id }));
  const existing = new Map<string, ConvergenceAssignment>(queryAll<{ team_id: number; members_json: string }>(
    'SELECT team_id, members_json FROM convergence_circles',
  ).map((row) => [String(row.team_id), {
    version: 2, memberIds: JSON.parse(row.members_json) as string[], seal: teamSeal(row.team_id),
    card: { width: 31, height: 9, lit: [] },
  }]));
  const persisted = existing.get(String(teamId));
  if (persisted) {
    const members = persisted.memberIds;
    if (!Array.isArray(members) || (members.length !== 2 && members.length !== 3)
      || !members.includes(String(teamId)) || new Set(members).size !== members.length
      || members.some((id) => !teams.some((team) => team.id === id)
        || JSON.stringify(existing.get(id)?.memberIds) !== JSON.stringify(members))) {
      throw new HttpError(503, 'The persisted lantern circle is inconsistent.');
    }
    return members;
  }
  let groups: string[][];
  try { groups = planConvergenceGroups(teams, existing); }
  catch (error) { throw new HttpError(503, error instanceof Error ? error.message : 'The lantern circles are not ready.'); }
  transaction(getDb(), () => {
    for (const members of groups) {
      for (const id of members) getDb().prepare(
        'INSERT OR IGNORE INTO convergence_circles (team_id, members_json) VALUES (?, ?)',
      ).run(Number(id), JSON.stringify(members));
    }
  });
  const members = groups.find((group) => group.includes(String(teamId)));
  if (!members) throw new HttpError(404, 'Team not found.');
  return members;
}

function hasArrived(teamId: number): boolean {
  return Boolean(queryOne('SELECT team_id FROM convergence_arrivals WHERE team_id = ?', teamId)
    || queryOne("SELECT team_id FROM team_progress WHERE team_id = ? AND puzzle_id = 7 AND status = 'solved'", teamId));
}

export function circleRiddle(teamId: number) {
  convergenceCircle(teamId);
  const assignments = queryAll<{ team_id: number; members_json: string }>('SELECT team_id, members_json FROM convergence_circles ORDER BY team_id');
  const groups = [...new Map(assignments.map((row) => [row.members_json, JSON.parse(row.members_json) as string[]])).values()];
  const existing = new Map(queryAll<{ team_id: number; riddle_set: string }>('SELECT team_id, riddle_set FROM convergence_riddles')
    .map((row) => [String(row.team_id), row.riddle_set]));
  const sets = planRiddleSets(groups, existing);
  transaction(getDb(), () => {
    for (const [id, set] of sets) getDb().prepare('INSERT OR IGNORE INTO convergence_riddles (team_id, riddle_set) VALUES (?, ?)').run(Number(id), set);
  });
  return CONVERGENCE_RIDDLES.find((riddle) => riddle.id === sets.get(String(teamId)))!;
}

export function overlayState(teamId: number) {
  const memberIds = convergenceCircle(teamId);
  const riddle = circleRiddle(teamId);
  const cards = buildOverlayCards(memberIds);
  getDb().prepare('INSERT OR IGNORE INTO convergence_arrivals (team_id) VALUES (?)').run(teamId);
  const verified = queryAll<{ partner_id: number }>('SELECT partner_id FROM convergence_seals WHERE team_id = ?', teamId);
  return {
    ownId: String(teamId), seal: teamSeal(teamId), card: cards[memberIds.indexOf(String(teamId))],
    clueIndex: memberIds.indexOf(String(teamId)),
    clue: riddle.clues[memberIds.indexOf(String(teamId))],
    partners: memberIds.filter((id) => id !== String(teamId)).map((id) => {
      const arrived = hasArrived(Number(id));
      const isVerified = arrived && verified.some((row) => row.partner_id === Number(id));
      return {
        teamId: id, name: queryOne<{ name: string }>('SELECT name FROM teams WHERE id = ?', Number(id))!.name,
        arrived, verified: isVerified, card: isVerified ? cards[memberIds.indexOf(id)] : null,
        clueIndex: isVerified ? memberIds.indexOf(id) : null,
        clue: isVerified ? riddle.clues[memberIds.indexOf(id)] : null,
      };
    }),
  };
}

export function verifySeal(teamId: number, rawSeal: string) {
  if (typeof rawSeal !== 'string' || rawSeal.length === 0 || rawSeal.length > 40) throw new HttpError(400, 'That is not a seal.');
  const members = convergenceCircle(teamId);
  if (!hasArrived(teamId)) throw new HttpError(423, 'Reach the Convergence before exchanging seals.');
  const { fails } = queryOne<{ fails: number }>(
    'SELECT COUNT(*) AS fails FROM seal_attempts WHERE team_id = ? AND ok = 0 AND attempted_at > ?',
    teamId, new Date(Date.now() - SEAL_WINDOW_MS).toISOString(),
  )!;
  if (fails >= SEAL_MAX_FAILS) throw new HttpError(429, 'Too many false seals. Try again later.');
  const partnerId = members.find((id) => id !== String(teamId) && normaliseSeal(teamSeal(Number(id))) === normaliseSeal(rawSeal));
  getDb().prepare('INSERT INTO seal_attempts (team_id, ok) VALUES (?, ?)').run(teamId, partnerId ? 1 : 0);
  if (!partnerId) throw new HttpError(404, 'That seal is not from a partner in your circle.');
  if (!hasArrived(Number(partnerId))) throw new HttpError(423, 'Your partner must reach the Convergence before their seal can be accepted.');
  const result = getDb().prepare('INSERT OR IGNORE INTO convergence_seals (team_id, partner_id) VALUES (?, ?)')
    .run(teamId, Number(partnerId));
  return { partnerName: queryOne<{ name: string }>('SELECT name FROM teams WHERE id = ?', Number(partnerId))!.name,
    alreadyHeld: result.changes === 0 };
}

export function validateOverlaySubmission(teamId: number, proof: string | undefined): void {
  const members = convergenceCircle(teamId);
  try { parseAlignment(proof, members, String(teamId)); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new HttpError(400, error.message);
  }
  for (const id of members.filter((member) => member !== String(teamId))) {
    if (!hasArrived(Number(id)) || !queryOne('SELECT team_id FROM convergence_seals WHERE team_id = ? AND partner_id = ?', teamId, Number(id))) {
      throw new HttpError(400, 'Every partner must arrive and have their seal verified before offering the word.');
    }
  }
}
