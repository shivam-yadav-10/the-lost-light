# The Lost Light

A Diwali scavenger hunt built with React, TypeScript and Vite. Teams recover six
fragments, collaborate at Convergence, and approach the Final Vault.

**Live site:** https://shivam-yadav-10.github.io/the-lost-light/

## Current architecture

The deployed frontend runs on GitHub Pages and uses Firebase Anonymous
Authentication and Cloud Firestore directly. GitHub Pages does not run an API
server. The Express/SQLite backend remains available for local reference,
content tooling and regression tests; it is not deployed by the Pages workflow.

Hash-based routing and Vite's `/the-lost-light/` base path support project-site
URLs, nested-route refreshes, images and fonts.

## Gameplay

- Questions I through VI unlock sequentially at the confirmed event times below.
  Schedule overrides do not bypass prerequisites. Questions VII (Convergence) and
  VIII (Final Vault) have no clock release; their existing prerequisite gates remain.
- Teams have 12 hints across the entire game, with at most three per question.
- Up to three browsers/devices may be linked to a team.
- Question V requires checking all five riddle answers before final submission.
- The Lantern Courtyard has 20 rotating mirrors, team-specific positions,
  click-to-cycle symbols and a responsive 70/30 desktop layout.
- Convergence uses assigned partner circles and an interactive lantern-card puzzle.
  Partner assignments remain stable across browsers and refreshes.

### Event schedule and scoring

On 10 November 2026, the six scheduled releases are:

| Question | IST | UTC (`unlockAt`) |
| --- | --- | --- |
| Q1 | 13:00 | 07:30Z |
| Q2 | 13:30 | 08:00Z |
| Q3 | 14:00 | 08:30Z |
| Q4 | 14:30 | 09:00Z |
| Q5 | 15:00 | 09:30Z |
| Q6 | 15:30 | 10:00Z |

The ranking clock starts for every team at the fixed first release, 13:00 IST
(07:30Z), regardless of when a team logs in or first opens a question. A team's
adjusted time is elapsed time from that start until Final Vault completion plus
the cumulative penalty for all hints used. Lower adjusted time ranks first;
fewer total hints break an exact adjusted-time tie, then the lower stable team
number breaks any remaining tie. Teams that have not completed the Vault rank
after all finishers. Existing limits (12 team hints, at most three per question)
and per-hint penalty amounts are unchanged.

Puzzle solutions, seal values, team credentials and organiser walkthroughs are
intentionally omitted from this README.

Signed-in game pages display a centered glowing countdown to the next core-question release,
with a short caption. It follows effective release overrides, not a separate event-start countdown,
and disappears when all six scheduled releases have passed. Scoring details remain in the organiser
view, not player pages. Before any core question releases, signed-in players are redirected to a dark
waiting screen with only the countdown and anticipatory text. That screen checks for manual releases
every 15 seconds. The release gate covers every route for signed-in teams, including direct URL
navigation and unknown paths, except `/admin`, which retains its organiser authentication.
Signed-out users can still reach login and organiser authentication.
Each locked core question also shows its scheduled IST release beneath its diya, alongside
a reminder that earlier questions must be completed. Release labels disappear once the diya unlocks.
Release status refreshes at scheduled boundaries without a manual page reload. A release never
bypasses prerequisites. The countdown uses the device clock and is not an authoritative time source.

## Requirements

- Node.js 22.13 or newer; the deployment workflow uses Node.js 24.
- npm.

On Windows, if PowerShell blocks `npm.ps1`, use `cmd /c npm ...`.

## Install and run

From the repository root:

```bash
npm install
npm run install:all
npm run dev
```

`npm run dev` starts the Firebase-backed frontend. Use the local URL printed by
Vite. Configure Firebase as described below to use game features.

```bash
npm run typecheck
npm run build
npm test --prefix frontend
npm test --prefix backend
npm run content:check
```

Content checks can print protected puzzle information. Keep their output and
generated answer-key files out of public issues, screenshots and build logs.

## Firebase configuration

Register a Firebase Web app, enable Anonymous Authentication, and create a
Firestore database. Copy `frontend/.env.example` to `frontend/.env` and set the
values from the Web app configuration:

| Environment variable | Firebase Web app field |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

Use the Firebase Console for the actual values. Do not copy service-account
credentials, admin keys or private game data into any `VITE_*` variable: Vite
embeds these variables in the public browser bundle. Firebase Web app
configuration is public client configuration, not an authorization boundary.

Missing Firebase configuration must not block the landing page or static build.
Game features require a configured, reachable Firebase project and show
"Game services are not connected yet." when services are unavailable.

### Access limitations

The checked-in `firestore.rules` currently permits **every authenticated user,
including anonymous users, to read and write every document**. Gameplay checks
and organiser UI restrictions run in the browser; they do not enforce database
isolation or prevent tampering.

Do not treat collection names such as `privatePuzzles` or `privateTeamData` as
access controls. Do not store sensitive personal information or credentials in
this database under the current rules. Removing credentials from documentation
does not secure the application or its database.

## GitHub Pages deployment

1. In repository settings, choose **Pages > Build and deployment > Source >
   GitHub Actions**.
2. Add the six `VITE_FIREBASE_*` variables above as GitHub Actions repository
   secrets. Use the exact variable names.
3. Push to `main`, or manually run `.github/workflows/deploy-pages.yml`.

The workflow installs frontend dependencies with `npm ci`, builds the Vite app,
uploads `frontend/dist`, and deploys using the official GitHub Pages Actions.
It does not deploy Firebase rules, seed Firestore, or deploy the legacy backend.

To reproduce the frontend build locally:

```bash
npm ci --prefix frontend
npm run build --prefix frontend
```

The deployed application is available under `/the-lost-light/`. Routes use
the hash, for example `/the-lost-light/#/login`.

## Content and organiser tooling

Player-facing content lives in `backend/src/content/public.ts`; validation and
reward metadata live in `backend/src/content/protected.ts`. These source files
are not a secret store: anyone with repository access can read them.

Use unique, privately distributed team credentials. Do not reuse seed fixtures
or development admin defaults for a live event. Configure local backend tools
through `backend/.env`, based on `backend/.env.example`, rather than publishing
credential values in documentation.

Keep the existing `GAME_SECRET` stable once event data has been provisioned.
Changing it can invalidate derived event data. Store Admin SDK credentials
outside the repository and refer to them using
`GOOGLE_APPLICATION_CREDENTIALS`; never paste their contents into source,
documentation or logs.

### Targeted Convergence provisioning

For an existing roster, preview the partner assignments before applying changes:

```bash
npm run firestore:seed --prefix backend -- --convergence-only
npm run firestore:seed --prefix backend -- --convergence-only --apply
```

These commands require the configured Firebase project, Admin SDK credentials
and the existing backend `GAME_SECRET`. The first command is read-only. The
second updates Convergence content and persisted partner-circle data without
resetting progress, hint usage, browser bindings or existing Vault proofs.
It creates a missing Vault proof if needed.

Existing circles are retained. Roster changes that would leave a lone team or
require an existing circle to be reassigned fail rather than silently changing
partners. Review roster changes before play. Provision matching content before
deploying frontend changes that require it.

General seeding and local reset commands have broader effects. Do not run them
against live event data as a substitute for a targeted content update.

The schedule/scoring metadata is sourced from `backend/src/content/public.ts`
and `backend/src/scripts/seed-firestore.ts`. For a live Firestore cutover, the
minimum relevant fields are `puzzles/1.unlockAt` through `puzzles/6.unlockAt`
(the UTC timestamps above), `puzzles/7.unlockAt` and `puzzles/8.unlockAt` (both null),
and `gameConfig/main.eventDate` (`2026-11-10`), `gameConfig/main.timezone`
(`Asia/Kolkata`), `gameConfig/main.scheduleStartAt` (Firestore Timestamp for
2026-11-10 07:30Z), and `gameConfig/main.scoringRule`
(`elapsed-from-schedule-start-plus-hint-penalties`). Store all non-null
`unlockAt` and `scheduleStartAt` values as Firestore Timestamps.
Keep each puzzle's existing `requires` sequential prerequisites and
`hintPenalties` unchanged. The admin release controls store active overrides in
`gameConfig/main.unlockOverrides`; preserve the complete existing map when
updating schedule/config fields. The normal seed operation merges this document
and only initializes `unlockOverrides` when the field is absent. Do not replace
the config document or clear overrides as part of the cutover. Each override is
keyed by puzzle ID and contains its effective Firestore Timestamp; review any
retained overrides since they take precedence over the new base schedule. No
live Firestore writes are performed by this implementation.

## Repository layout

```text
.github/workflows/deploy-pages.yml   GitHub Pages deployment
frontend/src/pages/                 Player and organiser screens
frontend/src/components/            Interactive puzzle components
frontend/src/api/                   Firestore-backed game API and types
frontend/src/services/              Firebase and gameplay helpers
frontend/tests/                     Frontend regression tests
backend/src/content/                Content definitions and checks
backend/src/scripts/                Firestore provisioning tools
backend/src/services/               Legacy engine and content helpers
backend/tests/                      Backend regression tests
firestore.rules                     Current database access policy
```

Local environment files, databases, generated answer keys and the organiser
`docs/` directory are excluded from Git. Keep private operational guides
outside tracked documentation.

## Credential hygiene

- Never commit team keys, admin credentials, service-account JSON, access tokens,
  credential hashes or live seal/proof values.
- Generate unique credentials locally and distribute them through a private
  organiser-controlled channel.
- If a published value was used for a real deployment, rotate it and update
  affected records. Removing it from the current README does not remove it from
  Git history, caches, forks or other source files.
- This README cleanup does not rotate credentials, rewrite Git history or audit
  the rest of the repository.
