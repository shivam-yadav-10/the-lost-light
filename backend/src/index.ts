import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { applySchema, getDb } from './db/connection.js';
import { api } from './routes/api.js';
import { HttpError } from './types.js';

applySchema(getDb());

if (!process.env.GAME_SECRET) {
  console.warn(
    JSON.stringify({
      level: 'WARN',
      service: 'lost-light-api',
      message: 'GAME_SECRET is not set; using the local dev secret. Set it before the event.',
    }),
  );
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigin, allowedHeaders: ['Content-Type', 'X-Game-Key', 'X-Admin-Key'] }));
app.use(express.json({ limit: '10kb', type: 'application/json' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', api);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Generic client messages; details stay server-side.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body.' });
    return;
  }
  console.error(JSON.stringify({ level: 'ERROR', service: 'lost-light-api', message: String(err) }));
  res.status(500).json({ error: 'Something went wrong in the dark.' });
});

app.listen(config.port, () => {
  console.log(`The Lost Light API listening on http://localhost:${config.port}`);
});
