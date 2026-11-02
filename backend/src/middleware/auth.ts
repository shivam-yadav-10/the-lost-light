import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { findTeamByKey, touchTeam } from '../services/gameEngine.js';
import { HttpError, type TeamRow } from '../types.js';

declare module 'express-serve-static-core' {
  interface Request {
    team?: TeamRow;
  }
}

const GAME_KEY_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

export function extractGameKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toUpperCase();
  return GAME_KEY_PATTERN.test(key) ? key : null;
}

export function requireTeam(req: Request, _res: Response, next: NextFunction): void {
  const key = extractGameKey(req.header('x-game-key'));
  const team = key ? findTeamByKey(key) : undefined;
  if (!team) return next(new HttpError(401, 'Unknown or missing game key.'));
  touchTeam(team.id);
  req.team = team;
  next();
}

// ---------- admin ----------

const ADMIN_MAX_FAILURES = 5;
const ADMIN_WINDOW_MS = 15 * 60_000;
const ADMIN_LOCKOUT_MS = 15 * 60_000;

interface FailureRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

/** Wrong admin-key attempts per client IP. In memory: a server restart clears it. */
const adminFailures = new Map<string, FailureRecord>();

function sameKey(given: string, expected: string): boolean {
  // Hash first so lengths always match; timingSafeEqual then avoids leaking how much of the key was right.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * Admin gate: correct X-Admin-Key required. After 5 wrong keys from one IP within 15 minutes,
 * that IP is locked out for 15 minutes (even with the right key). A correct key resets the count.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const now = Date.now();
  const record = adminFailures.get(ip);

  if (record && record.lockedUntil > now) {
    const minutes = Math.ceil((record.lockedUntil - now) / 60_000);
    return next(new HttpError(429, `Too many wrong admin keys. Try again in ${minutes} min.`));
  }

  const given = req.header('x-admin-key') ?? '';
  if (given.length > 0 && sameKey(given, config.adminKey)) {
    adminFailures.delete(ip);
    return next();
  }

  const fresh = !record || now - record.firstFailureAt > ADMIN_WINDOW_MS;
  const updated: FailureRecord = fresh
    ? { failures: 1, firstFailureAt: now, lockedUntil: 0 }
    : { ...record, failures: record.failures + 1 };
  if (updated.failures >= ADMIN_MAX_FAILURES) {
    updated.lockedUntil = now + ADMIN_LOCKOUT_MS;
    console.warn(
      JSON.stringify({ level: 'WARN', service: 'lost-light-api', message: 'Admin key lockout', ip, failures: updated.failures }),
    );
  }
  adminFailures.set(ip, updated);

  const left = ADMIN_MAX_FAILURES - updated.failures;
  next(
    left > 0
      ? new HttpError(401, `Unauthorised. ${left} attempt${left === 1 ? '' : 's'} left before a 15-minute lockout.`)
      : new HttpError(429, 'Too many wrong admin keys. Try again in 15 min.'),
  );
}
