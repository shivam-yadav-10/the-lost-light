# The Lost Light

A local-first Diwali scavenger hunt for the GTCI event on **10 November**.
10–15 teams, 3–5 people each, playing asynchronously through the working day:
six core "fragments", then two endgame puzzles (one of which needs cross-team collaboration).

This repository contains the game frontend and local development backend. Organiser-only design documents
are kept in the local `docs/` directory and excluded from Git.

## Gameplay rules

Questions must be completed in order, from I through VIII. A release-time override does not bypass
the preceding question or any additional prerequisites. Existing solved questions remain solved.
The frontend enforces this order even against older Firebase puzzle metadata, without reseeding progress.

Each team shares **12 hints across the entire game**, including Convergence and the Final Vault.
A question allows at most **3 hints** (or fewer if fewer are provisioned). Previously used hints count
toward both limits; refreshing, switching devices, and solving a question do not replenish them.
Firestore hint transactions read all eight progress records so simultaneous requests on different
questions cannot overspend the shared allowance.

The page suppresses right-click menus and common inspection shortcuts (including Ctrl+Shift+I and F12).
This is only a casual deterrent: it cannot disable browser tab menus, browser-menu DevTools, extensions,
already-open tools, or direct database access. Client-side rules are not an anti-cheating security boundary.

Frontend rule and interaction tests: `npm test --prefix frontend`.
Local backend rule tests use an isolated in-memory database: `npm test --prefix backend`.

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

## Firebase Setup

The Firebase Web SDK is already a frontend dependency. The Firebase service files are scaffolds only:
the current UI still uses the Express API, no Firebase project values are checked in, and missing values
leave the landing page and GitHub Pages build working.

### 1. Firebase Console settings

In the existing Firebase project:

1. In **Project settings → General → Your apps**, register a Web app if one does not already exist.
2. In **Authentication → Sign-in method**, enable **Anonymous** when you are ready to test that flow.
   The app does not assume this provider is enabled.
3. Create a **Cloud Firestore** database and choose its production region. Keep the supplied
   `firestore.rules` default-deny until the authentication and team-ownership model has been reviewed.
4. Firebase Storage is not used by this scaffold; do not enable it just for this migration step.

### 2. Get the Web App configuration

Open **Project settings → General → Your apps → [your Web app] → SDK setup and configuration** and select
the Firebase configuration snippet. Copy the corresponding values; do not invent, commit, or paste them
into source files:

| Firebase Web App field | Environment variable |
| --- | --- |
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

### 3. Local environment

Copy `frontend/.env.example` to `frontend/.env` and replace each placeholder with the matching Web App
value. Vite reads these values while running/building the frontend. `.env`, `.env.local`, and
`.env.production.local` are ignored; `.env.example` is intentionally tracked.

```text
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 4–5. GitHub Pages production build variables

The Pages workflow reads the six `VITE_FIREBASE_*` values from GitHub Actions repository **Secrets**.
Create a repository secret for each exact name in the table above under
**Settings → Secrets and variables → Actions → Secrets**. The workflow references secret names only; do
not put real values in the workflow or README. Vite embeds these `VITE_*` values in the public browser
bundle, so GitHub Secrets protects them only before/during the build, not after deployment. Restrict the
Firebase API key to the APIs and referrers the app needs, including the GitHub Pages origin and local
development origin.

The variables are optional for the present scaffold. If unset, Firebase stays uninitialized, the build
still succeeds, and Firebase-dependent service calls return “Game services are not connected yet.”
Never put server credentials or private game data in `VITE_*` variables.

### 6. Verify Firebase connectivity

After setting local values, run `npm run dev:frontend`. The exported
`firebaseInitializationStatus` should be `ready`; this confirms SDK initialization, not network
connectivity or authorization. The first real network check is a successful Anonymous Authentication
request (step 8 below). Firebase-dependent UI calls are not connected yet.

### 7. Verify Firestore connectivity

Firestore rules currently deny every client read and write, and no production documents are seeded.
Use the Firebase Console Rules Playground to test access after the team/auth rules are finalized. A
client read of `gameConfig/main` is expected to be denied until an explicit narrow read rule and the real
configuration document exist. Do not loosen rules or create placeholder production data just to make a
connectivity check pass.

### 8. Verify Anonymous Authentication

Enable the Anonymous provider, invoke `signInPlayerAnonymously()` from a local test harness, and confirm
the returned user's `isAnonymous` value is `true`. A successful call verifies that the app can reach
Firebase Authentication. The service is not wired to the player UI yet; sign-in is never started
automatically.

The planned Firestore paths are:

| Path | Intended contents and access boundary |
| --- | --- |
| `gameConfig/main` | Public game configuration and schedule; no secrets |
| `teams/{teamId}` | Team identity and anonymous UID association; never expose raw game keys |
| `teams/{teamId}/progress/{puzzleId}` | That team's status, hints used, and timestamps |
| `puzzles/{puzzleId}` | Player-facing puzzle content only; never canonical answers or private codes |
| `submissions/{submissionId}` | Private submission metadata scoped to its owning team |
| `checkpoints/{checkpointId}` | Checkpoint metadata; validation codes must not be readable by all players |

`firestore.rules` is deliberately default-deny. Final rules must bind authenticated UIDs to team
ownership and prevent cross-team reads. Puzzle answers, game-key validation, rate limits, and other
trusted decisions must not move into publicly readable client data. Cloud Functions are not configured;
keep those operations in the existing Express backend until a secure replacement is selected.

### Migration map

| Express/SQLite component | Firebase replacement | Status |
| --- | --- | --- |
| Vite Firebase configuration | `frontend/src/services/firebase.ts` and environment variables | READY FOR CONFIG |
| Express route/UI API calls | `gameService.ts`, `puzzleService.ts`, and `teamService.ts` boundary | SCAFFOLDED |
| Team game-key login and Express key middleware | Anonymous Auth plus trusted team-key validation | SCAFFOLDED |
| SQLite `teams`, `puzzles`, `hints`, and `team_progress` | `teams/{teamId}`, team progress subcollection, and `puzzles/{puzzleId}` | SCAFFOLDED |
| SQLite submissions and checkpoint visits | `submissions/{submissionId}` and `checkpoints/{checkpointId}` | SCAFFOLDED |
| SQLite convergence tables, protected answers, admin operations, and seed/migration tooling | Additional secure model and trusted operations | NOT STARTED |
| Frontend cutover from Express/SQLite | Use Firebase services in the UI after the vertical slice is verified | NOT STARTED |

No component is marked `MIGRATED`. The Express + SQLite backend remains intact and operational.
