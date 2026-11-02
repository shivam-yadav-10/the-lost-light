# The Lost Light

A local-first Diwali scavenger hunt for the GTCI event on **10 November**.
10–15 teams, 3–5 people each, playing asynchronously through the working day:
six core "fragments", then two endgame puzzles (one of which needs cross-team collaboration).

This repository contains the game frontend and local development backend. Organiser-only design documents
are kept in the local `docs/` directory and excluded from Git.

## Prerequisites

- **Node.js ≥ 22.13** (tested on 24). The backend uses Node's built-in `node:sqlite`, so there are no native
  modules to compile.
- npm (ships with Node).
- On Windows PowerShell, if `npm` is blocked by execution policy, run it as `cmd /c npm ...`.

## Installation

```bash
npm install            # root: installs `concurrently`
npm run install:all    # installs backend/ and frontend/ dependencies
```

## Database initialisation

```bash
npm run db:init        # creates backend/data/game.db, applies schema, loads content (idempotent)
npm run db:reset       # deletes the database and seeds from scratch (erases all progress)
npm run content:apply  # re-loads puzzle content from backend/src/content, keeping team progress
npm run content:check  # re-derives every answer and checks the design invariants (must pass)
npm run progress:reset # fresh start for every team (keeps teams + puzzles; safe while the server runs)
npm run answer-key     # writes ANSWER-KEY.md (git-ignored): every team's answers, codes and keys
```

The database file is git-ignored.

## Run locally

**Windows one-click:** double-click `start.bat` (or run it from a terminal). It installs any missing
dependencies, initialises the database, and starts both servers. `Ctrl+C` stops both.

**Manually:**

```bash
npm run dev            # starts API (http://localhost:4000) and web (http://localhost:5173) together
```

Or separately: `npm run dev:backend` / `npm run dev:frontend`.
Vite proxies `/api/*` to the backend, so the browser only talks to one origin in dev.
If port 5173 is busy, Vite picks the next free port and prints it.

**Fake-time test server:** double-click `test-server.bat` (or run `npm run dev:test`). It starts a
second API + web pair with the clock frozen at 10 Nov 15:30 IST (puzzles I–V open) and its own fresh
database (`backend/data/test-<api-port>.db`, so several can run side by side), so it never touches your real data. Preferred ports are 4100 (API) and
5180 (web). If either is busy, the next free port is used and printed. Options:

```bash
test-server.bat --now=2026-11-10T04:05:00Z   # any fake time (UTC); 04:05Z = 09:35 IST, only The Festival Street open
test-server.bat --keep                       # keep the previous test database instead of resetting
test-server.bat --api-port=4200 --web-port=5280
```

Pages:

| Route (hash-based)       | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `/#/`                    | Landing                                              |
| `/#/login`               | Enter team key (stored in `localStorage`)            |
| `/#/dashboard`           | Six diyas, light %, recovered fragment cards, code entry |
| `/#/puzzle/:id`          | Puzzle, hints, answer submission, fragment card on solve |
| `/#/checkpoint[/:code]`  | Redeem a physical marker code (QR can deep-link)     |
| `/#/convergence`         | Team lantern, shard + seal, seal verification, key   |
| `/#/vault`               | Final word + proof code                              |
| `/#/complete`            | Completion                                           |
| `/#/admin`               | Organiser view (needs admin key)                     |

### Test credentials (local seed only)

| Team         | Game key       |
| ------------ | -------------- |
| Team Agni    | `AGNI-2026`    |
| Team Jyoti   | `JYOTI-2026`   |
| Team Deepa   | `DEEPA-2026`   |
| Team Prakash | `PRAKASH-2026` |

Four teams are seeded so all four Convergence shard types can be exercised. Answers, checkpoint codes and
the full walkthrough are in [`docs/testing-guide.md`](docs/testing-guide.md). The admin key (local default)
is `local-admin`. Override it with `ADMIN_KEY` in `backend/.env`.

Replace the teams in `backend/src/content/teams.ts` before the event.

### Configuration

Copy `backend/.env.example` to `backend/.env` if you need to override anything
(`PORT`, `DB_PATH`, `CORS_ORIGIN`, `ADMIN_KEY`, `GAME_SECRET`, `FAKE_NOW`).

- `GAME_SECRET` derives every team's Convergence lantern, key and seal. Set a long random value for the
  event and never change it once the Convergence has opened.
- `ADMIN_KEY` opens `/#/admin`. Five wrong keys from one IP within 15 minutes lock that IP out of the admin
  page for 15 minutes (restarting the server clears lockouts).
- A local `backend/.env` with random values for both has already been generated (git-ignored). The fake-time
  test server reads it too.
- `FAKE_NOW` freezes the server clock so the scheduled unlocks can be tested (e.g. `2026-11-10T10:00:00Z`).
- `VITE_API_PROXY` (frontend, dev only) points the Vite proxy at a different backend, e.g. `http://localhost:4100`.

## Project structure

```
.
├── start.bat                    # Windows one-click: install (if needed) → db:init → dev
├── test-server.bat              # fake-time test server (own DB, free ports) → scripts/test-server.mjs
├── package.json                 # root scripts (dev, db:*, content:*, typecheck, build)
├── docs/                        # organiser-only design docs (contain answers)
├── backend/
│   ├── src/
│   │   ├── index.ts             # Express app, CORS, error handling
│   │   ├── config.ts            # env-driven settings
│   │   ├── types.ts             # DB rows + API shapes (answers never leave the server)
│   │   ├── content/
│   │   │   ├── public.ts        # player-facing text + visuals (served only after unlock)
│   │   │   ├── protected.ts     # answers, aliases, near-misses, hints, fragment metadata, codes, shards
│   │   │   ├── teams.ts         # seeded teams (test credentials)
│   │   │   ├── types.ts         # content model
│   │   │   └── check.ts         # `content:check`: re-derives every answer, checks invariants and leaks
│   │   ├── db/
│   │   │   ├── schema.sql       # teams, puzzles, hints, team_progress, submissions, checkpoints, convergence_*
│   │   │   ├── connection.ts    # node:sqlite handle, typed query helpers, transaction(), migration
│   │   │   ├── seed.ts          # upserts content into SQLite (keeps progress)
│   │   │   └── init.ts          # `db:init` / `db:reset` / `content:apply`
│   │   ├── middleware/auth.ts   # X-Game-Key → req.team, X-Admin-Key gate
│   │   ├── services/
│   │   │   ├── gameEngine.ts    # unlock rules, validation, rate limits, hints, checkpoints, admin overview
│   │   │   ├── convergence.ts   # team lanterns, keys and unforgeable seals (from GAME_SECRET)
│   │   │   └── normalise.ts     # answer/code normalisation
│   │   └── routes/api.ts        # REST endpoints
│   └── data/game.db             # created by db:init (git-ignored)
└── frontend/
    ├── vite.config.ts           # /api proxy, VITE_BASE_PATH for GitHub Pages
    ├── tailwind.config.ts       # midnight/ember palette, diya animations
    └── src/
        ├── api/                 # fetch client + response types
        ├── store/               # team session, progress and puzzle hooks
        ├── components/          # Layout, DiyaLamp, PuzzleBlocks, Mandala, CipherBlock, Lantern, FragmentCard, …
        └── pages/               # Landing, Login, Dashboard, Puzzle, Checkpoint, Convergence, Vault, Completion, Admin
```

## API

All team endpoints require header `X-Game-Key: <team key>`. Admin endpoints require `X-Admin-Key`.

| Method | Path                         | Notes                                              |
| ------ | ---------------------------- | -------------------------------------------------- |
| POST   | `/api/team/login`            | `{ gameKey }` → `{ teamId, teamName, introSeen }`  |
| POST   | `/api/team/intro-seen`       | Records that the team finished or skipped the opening story |
| GET    | `/api/game/status`           | Public; server time + event date                   |
| GET    | `/api/team/progress`         | States, light %, earned fragment cards, checkpoints |
| GET    | `/api/puzzles/:id`           | 423 if LOCKED; content blocks, hints, fragment once solved |
| POST   | `/api/puzzles/:id/submit`    | `{ answer, proof? }` → `{ correct, message, fragment, puzzle }`; cooldown + lockout per puzzle; the Vault needs `proof` |
| POST   | `/api/puzzles/:id/hint`      | Reveals the next hint (adds a time penalty)        |
| POST   | `/api/checkpoints/:code`     | Records a physical marker visit                    |
| GET    | `/api/convergence`           | The team's own lantern, shard + seal, verified rules |
| POST   | `/api/convergence/verify`    | `{ seal }` → reveals that shard's rule if the seal is genuine |
| GET    | `/api/admin/overview`        | Per-team state, hints, penalties, shards, keys, Keeper seals |
| POST   | `/api/admin/puzzles/:id/unlock-override` | `{ unlocked }` → forces one of the six core fragments open now or re-locks it, overriding the schedule for every team |

Unlock rule: a puzzle is AVAILABLE when its `unlockAt` (if set) has passed **and** every puzzle in its
`requires` list is solved. Answers are normalised (lower-case, trimmed, punctuation stripped) and checked
only on the server. No response ever includes answers, other teams' keys or seals, or admin data.

## Editing content

Edit `backend/src/content/public.ts` (player text, unlock times) and `protected.ts` (answers, hints,
metadata, codes). Then run `npm run content:check` and `npm run content:apply`. Replace the
`[LOCATION_…]` placeholders with real places before the event.

## GitHub Pages

The expected project-site URL is **https://shivam-yadav-10.github.io/the-lost-light/**. The project uses
hash-based routes (for example, `/#/login`) so refreshing a nested route works on GitHub Pages. Vite is
configured with the `/the-lost-light/` base path, including for built assets and fonts.

Push to the `main` branch to run `.github/workflows/deploy-pages.yml`. The workflow builds only
`frontend/` and deploys `frontend/dist`; it does not deploy or configure the local backend. Before the
first deployment, enable Pages in the GitHub repository settings and set **Pages → Build and deployment
→ Source** to **GitHub Actions**. The workflow token cannot enable Pages for the repository.

To install and build locally from the repository root:

```bash
npm install
npm run build
```

The landing page and its navigation work without game services. API-dependent game actions display
“Game services are not connected yet.” until an API is configured. No Firebase configuration is required
for this static deployment.
