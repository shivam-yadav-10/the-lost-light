import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { extractGameKey, requireAdmin, requireTeam } from '../middleware/auth.js';
import {
  adminOverview,
  assertConvergenceOpen,
  findTeamByKey,
  getConvergence,
  getPuzzleForTeam,
  getTeamProgress,
  markIntroSeen,
  requestHint,
  setPuzzleUnlockOverride,
  submitAnswer,
  touchTeam,
  visitCheckpoint,
} from '../services/gameEngine.js';
import { verifySeal } from '../services/convergence.js';
import { HttpError } from '../types.js';
import { EVENT_START_AT } from '../services/scoring.js';
import { PUBLIC_PUZZLES } from '../content/public.js';

export const api = Router();

const loginSchema = z.object({ gameKey: z.string().min(1).max(64) });
const answerSchema = z.object({ answer: z.string().min(1).max(200), proof: z.string().max(9000).optional() });
const sealSchema = z.object({ seal: z.string().min(1).max(40) });
const unlockOverrideSchema = z.object({ unlocked: z.boolean() });

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid puzzle id.');
  return id;
}

api.post('/team/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  const key = parsed.success ? extractGameKey(parsed.data.gameKey) : null;
  const team = key ? findTeamByKey(key) : undefined;
  if (!team) throw new HttpError(401, 'That key does not open any door.');
  touchTeam(team.id);
  res.json({ teamId: team.id, teamName: team.name, introSeen: team.intro_seen_at !== null });
});

api.post('/team/intro-seen', requireTeam, (req, res) => {
  markIntroSeen(req.team!.id);
  res.json({ introSeen: true });
});

api.get('/game/status', (_req, res) => {
  res.json({
    name: 'The Lost Light',
    serverTime: config.now().toISOString(),
    eventDate: '2026-11-10',
    timezone: 'Asia/Kolkata',
    scheduleStartAt: EVENT_START_AT,
    questionSchedule: PUBLIC_PUZZLES.filter((puzzle) => puzzle.kind === 'core').map(({ id, unlockAt }) => ({ id, unlockAt })),
    scoringRule: 'elapsed-from-schedule-start-plus-hint-penalties',
  });
});

api.get('/team/progress', requireTeam, (req, res) => {
  const team = req.team!;
  res.json({ teamId: team.id, teamName: team.name, introSeen: team.intro_seen_at !== null, ...getTeamProgress(team.id) });
});

api.get('/puzzles/:id', requireTeam, (req, res) => {
  res.json(getPuzzleForTeam(req.team!.id, parseId(req.params.id)));
});

api.post('/puzzles/:id/submit', requireTeam, (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Answer must be between 1 and 200 characters.');
  res.json(submitAnswer(req.team!.id, parseId(req.params.id), parsed.data.answer, parsed.data.proof));
});

api.post('/puzzles/:id/hint', requireTeam, (req, res) => {
  res.json(requestHint(req.team!.id, parseId(req.params.id)));
});

api.post('/checkpoints/:code', requireTeam, (req, res) => {
  res.json(visitCheckpoint(req.team!.id, req.params.code));
});

api.get('/convergence', requireTeam, (req, res) => {
  res.json(getConvergence(req.team!.id));
});

api.post('/convergence/verify', requireTeam, (req, res) => {
  const parsed = sealSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'That is not a seal.');
  assertConvergenceOpen(req.team!.id);
  res.json(verifySeal(req.team!.id, parsed.data.seal));
});

api.get('/admin/overview', requireAdmin, (_req, res) => {
  res.json(adminOverview());
});

api.post('/admin/puzzles/:id/unlock-override', requireAdmin, (req, res) => {
  const parsed = unlockOverrideSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Body must be { unlocked: boolean }.');
  setPuzzleUnlockOverride(parseId(req.params.id), parsed.data.unlocked);
  res.json(adminOverview());
});
