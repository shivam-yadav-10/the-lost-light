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

### Frontend loading

The landing page and shared layout load first. Other routes load on demand,
including Admin, the opening story, puzzles, Convergence, and the Vault.
The progress provider is also loaded on demand for a saved team session, so a
fresh landing-page visit does not download or initialize Firebase. Auth state
restoration starts when a game service first needs it. Page downloads show a
neutral loading view; failed downloads offer an explicit reload action.

## Gameplay

Exiting the opening story (Escape, Skip, or finishing it) refreshes team progress
before returning to the dashboard. The handoff also bypasses the intro redirect
so stale progress or a failed completion write cannot immediately reopen the story.

- Questions I through VI unlock sequentially at the confirmed event times below.
  Schedule overrides do not bypass prerequisites. Questions VII (Convergence) and
  VIII (Final Vault) have no clock release; their existing prerequisite gates remain.
- Teams have 12 hints across the entire game, with at most three per question.
- Up to three browsers/devices may be linked to a team.
- The Errand cycles teams across six locations: coffee machine, printer, water
  dispenser, cafeteria, the auto-rickshaw in Phase 2, and reception. Existing
  A–C card codes remain valid; D–F add three new cards.
- Question IV assigns each team one of nine numbered QR posters. A location riddle
  leads to its poster; any four distinct hidden words from that picture unlock the
  fragment. Word order and letter case do not matter; at most six words are accepted.
  A Keeper's-notebook answer panel tracks entered words only; its four-dot indicator
  does not reveal correctness before submission.
  Each field accepts a single A–Z word. Invalid typing or pasted text is rejected
  with an inline error; submit requires four distinct words in separate fields
  and no outstanding field errors.
- Question V requires checking all five riddle answers before final submission.
- The Final Vault opens with engraved latticework, lotus medallions, golden arches,
  a breaking light seal, doors swinging outward into the side space, drifting embers and a staged title reveal,
  then requires a six-disk Tower of Hanoi: move the stack from
  the left peg to the right, one top disk at a time, never larger onto smaller.
  Select a source tower and then its destination (mouse, touch, or keyboard).
  Disks visibly lift above the pegs, travel across, and settle onto their destination.
  Moves and restart are locked during the 950ms crossing so animations cannot overlap,
  but never wait for the database during normal play.
  Reduced-motion users get instant moves, a shortened entrance, and no drifting embers or rotating rays.
  Any legal solution counts; the minimum is 63 moves. Completing the tower reveals
  the existing final-word and team proof-code form. The move history is replayed
  during submission, not just checked by the UI. Every move and explicit restart is queued
  immediately in per-team `sessionStorage` before appearing on the board. There is no
  automatic cloud save timer, even with pending moves. Reload and in-app navigation
  preserve this tab's queue; a new tab restores only previously submitted cloud state.
  Network failures during submission are logged and retain the queue for an explicit retry;
  local storage failures explicitly block further moves.
  Opening the Vault flushes pending moves before submitting the existing word/proof.
  This assumes one active device per team: the latest batch replaces the saved tower.
  Closing the tab clears unsynced session data. Hints preserve the database draft.
  After a gameplay reset, use a new tab, or clear that team's
  `lostlight.hanoi.{teamId}` session key and reload; already-solved Vaults remain open.
  No Firestore migration or reseeding is required.
- `/complete` checks the team's Vault progress directly with Firestore before rendering
  any celebration. An unsolved Vault redirects to `/vault`; unavailable services show a retry
  instead of revealing the finale. The celebration has a staged dawn/reveal, floating lanterns,
  and canvas fireworks capped at 30 FPS with bounded particles. Fireworks pause in hidden tabs
  and are disabled for reduced-motion users.
- After Convergence is solved, the false Gold fragment's label and swatch display Green
  throughout the fragment cards. Before Convergence (or after its reset), it remains Gold;
  the keyword reversal remains part of the final-word puzzle.
- The Lantern Courtyard has 20 rotating mirrors, team-specific positions,
  click-to-cycle symbols and a responsive 70/30 desktop layout.
- Convergence uses assigned partner circles and illustrated complementary clue cards.
  Exchange every partner seal after they arrive, then find the five-letter word
  shared by the pictures' different meanings. Six distinct sets are available,
  assigned once per circle and persisted; triples receive a third complementary clue.
  with gentle illustration-specific idle motion (flames, drifting feathers,
  ticking hands, curious glances, and more). Text stays still and reduced-motion
  preferences disable the decorative animation.
  No set is reused: provisioning a seventh circle fails explicitly until more sets
  are added. Existing circle assignments are retained when teams are added.
  Also solve the restored lantern overlay: align all partner cards' corners and
  orientation dots, and read the five dark letters between the gold squares.
  Final submission requires the assigned riddle word plus the overlay word,
  separated by a space, in either order. Both partner seals and alignment are checked.
  Select a partner card, then focus the overlay and press Ctrl+R to rotate;
  Ctrl+Shift+R reverses it. Plain R/Shift+R and visible Rotate buttons also work.
  Outside the focused workspace Ctrl+R retains its normal browser-refresh behavior.
  Clues are assigned by the persisted circle's member order; partner clues remain
  sealed until their seals are verified. The targeted `--convergence-only --apply`
  migration assigns riddle sets and clues and updates instructions, hints, and answer
  data without changing seals, keys, progress, circles, or existing overlay masks.
  Partner assignments remain stable across browsers and refreshes.
  Desktop uses a 70/30 split: the introduction and illustrated cards on the left, with
  a sticky circle/seal, word submission, and hints sidebar aligned to the heading
  on the right. On smaller screens the sidebar stacks above the introduction and board.
  Convergence reveals its table and sidebar together once puzzle and circle data are
  ready. Initial release checks use a neutral loader on the game backdrop; the
  lantern-night waiting view appears only after progress confirms no question
  has been released. Reloading a playable dashboard or puzzle never uses the
  waiting backdrop as a loading placeholder. Reduced-motion preferences are respected.

### Question III piano gate

Before the original Question III text, answer and hints are revealed, each team
must replay its own eight-note melody with `A S D F G H J K L` or the on-screen
piano. Listen replays are unlimited; an incorrect note restarts the attempt.
Final teams and the four retained test teams have distinct, stable melodies
based on their document IDs. Audio is synthesized locally without asset downloads,
using a warm fundamental and quieter, faster-decaying harmonics for a piano-like
attack and ringing tail instead of a short triangle-wave beep.
Completion is saved in Question III's progress record and survives refresh;
resetting that progress also resets the gate. Already-solved questions remain solved.
Question III's original text is downloaded on entry, retained in memory and hidden
by the local piano UI until the Firebase melody save succeeds. Revealing it does
not reload the question. This is a presentation gate, not secrecy for downloaded
content; final answer and hint actions still validate the persisted melody gate.
The original answer, scoring and release schedule are unchanged.

No database provisioning is required. Using the local frontend with production Firebase still saves gameplay
progress to production; use a separate test project for isolated playtesting.

### Low-read refresh behaviour

The event-ready reset uses gameplay run
`production-event-2026-11-10-1300-ist-fresh-2026-11-07`. Loading this build clears
older game login/draft storage in each browser tab; team keys and puzzle
assignments are preserved in Firestore. Players must sign in again and see the
intro afresh. The organiser view displays dates and times in Asia/Kolkata.

The waiting room and organiser view no longer poll at fixed intervals.
Team progress loads once when the app opens. The next release timestamp is saved
in tab-scoped `sessionStorage` under the team ID and gameplay run; countdown ticks
run locally, without database reads. A one-shot refresh runs when that release
time is reached, and the waiting room waits for the result before opening.
Returning to a tab or focusing the window does not reload progress.

Press `Ctrl+Shift+R` inside the signed-in game to refresh progress once instead
of reloading the page (where the browser delivers this shortcut to the page).
Focused puzzle controls keep their existing shortcuts, including overlay rotation.
Held keys and overlapping refresh requests do not start extra reads. Normal
reload still fetches once and replaces the saved timestamp with the latest
schedule. Storage failures are logged and the countdown continues in memory.
Answer, hint, marker and intro actions update the dashboard from their confirmed
results instead of reloading the whole team. Later release deadlines only recompute
the display locally outside `/waiting`; puzzle pages never fetch background progress.
Failed requests require an
explicit Retry or refresh; they do not retry in a loop.

The organiser overview loads once after sign-in; use **Refresh** to fetch newer
data. Manual schedule changes are not pushed to already-open waiting rooms:
players must refresh to receive them. The GitHub Pages deployment does not run
database provisioning or migration commands.

The dashboard's **Refresh puzzle progress** button performs a lighter in-app refresh:
it reads only the team's puzzle progress and rewards for newly solved puzzles.
The page and login stay in place, and existing puzzle definitions, earned fragments,
team identity, schedule configuration and checkpoints are reused in memory.
It does not detect schedule changes, removed devices, event resets or new checkpoint
visits from another device; use `Ctrl+Shift+R` for a full data refresh.
Answer and hint submissions still validate current Firebase state. F5 / Ctrl+R remains
a normal browser reload. No mutable dashboard or login-validation cache is added.

Puzzle page displays reuse the current signed-in session's team record, progress,
public puzzle metadata and effective release state. They fetch only missing content,
revealed hint text and rewards not already loaded. They do not reread identity,
configuration or prerequisites on each navigation. `Ctrl+Shift+R` reloads the full
model and refreshes the open puzzle display; submitting an answer, buying a hint,
saving a melody or verifying a seal still validates fresh Firebase state.
Private answer keys are not cached. Five Dawns checks remain button-triggered and
the finale still requires a fresh server completion check.

The Vault seeds its tower from the progress snapshot already used to load the puzzle,
avoiding a second initial tower read. This never replaces an existing tab-local queue;
final submission still synchronizes and validates the saved move history.
Convergence seal verification returns the confirmed partner card and clue directly,
so accepting a seal no longer reloads the entire circle. **Refresh arrivals** remains
a deliberate fresh partner-state read, without polling.

Public puzzle metadata and earned reward documents also persist in this tab's
`sessionStorage`, isolated by Firebase project, gameplay run and team. Normal
Ctrl+R / F5 / reload restores those documents without fetching them again.
They remain cached until the tab closes, sign-in/sign-out, an event-run change,
or `Ctrl+Shift+R`, which clears both caches and fetches fresh data. Cached timestamps
are restored as Firestore timestamps so release calculations stay consistent.
Corrupt or unavailable storage logs a warning and falls back to Firebase.
Team/device validation, progress, checkpoints and live configuration are still
fetched on normal reload; only stable content is persisted. Content corrections
require `Ctrl+Shift+R` in already-open tabs.

Provisioned puzzle text and revealed hint text remain memory-only for up to five
minutes, shared between puzzle pages and the dashboard. Concurrent reads of the
same content share one request. Missing documents and errors are not cached.
Submission transactions always read
current team/device/run identity, puzzle release metadata, live configuration,
prerequisites and answer/proof data. Hint transactions still enforce the shared
12-hint allowance and per-question cap atomically. Mutable progress, live configuration
and final completion checks are not served from the content cache.

Dashboard reloads reuse earned rewards rather than reading every solved reward
again. Re-entering an already-claimed marker does not reload the dashboard.
Convergence arrivals remain manual-refresh only, with overlapping requests
deduplicated. Vault Hanoi moves cause no background reads or writes. Every move remains saved in
tab-local session storage immediately, and final submission drains all pending
moves before checking the Vault. Closing the tab or losing its session storage before
submission can lose the entire unsent tower. Changes from another device or organiser
are not automatically synced; use explicit refresh to receive them.

In development builds, `window.lostlightReadCounts.snapshot()` shows document,
query and transaction-read operation counters for puzzle APIs, progress loading,
content caching and Hanoi persistence; `.reset()` clears them. No document contents,
answers, credentials or remote telemetry are recorded. These are logical SDK operations,
not billable-read totals or Fetch/XHR counts: queries can return many documents,
transaction retries can add reads, and Firestore transport requests include setup
and target removal. The counter API is absent from production builds.

The separate organiser Firebase app/Auth initializes only when an admin operation
needs it, not when a player opens or reloads the game. Player Auth persistence
and its account-validation requests are unchanged; these do not use Firestore read quota.

The login cap remains three browser/device identities per team. One active
browser per team reduces duplicated activity, but multiple tabs in that browser
can still issue separate reads; authentication alone does not deduplicate tabs.

### QR picture assets and puzzle IV content

The Errand has six cards A–F. For an existing Firestore roster, preview its update with
`npm run firestore:seed --prefix backend -- --errands-only`; add `--apply` to
update puzzle-II content, group assignments, organiser locations, hints, and
the six claimable checkpoints. Assignments cycle A–F by stable team number
(team 4 now uses D rather than A). Existing solves, hint usage, browser bindings,
and release overrides are preserved. No frontend deployment is needed for this
content-only update; do not run a full seed or progress reset.

Gameplay resets clear team solves, hints used, checkpoint visits, Convergence
arrivals/seal verifications, and story-seen flags. Team keys, browser bindings,
partner assignments, and Vault proof keys are retained. Clear `gameConfig/main`
manual unlock overrides to restore the 10 November schedule below; Q7–Q8 remain
prerequisite-gated. A reset does not delete browser-local riddle drafts.
Regenerate the ignored local `ANSWER-KEY.md` with `npm run answer-key --prefix backend`
after applying local content changes. It reflects the local SQLite roster, not
automatically the live Firestore roster; keep it private.

Vite serves the repository's `assets` directory as public static files. Printed
QR codes should open the image directly, without a hash route or team login:
`https://shivam-yadav-10.github.io/the-lost-light/word-puzzle-1.webp`.
Pictures 1 and 3–9 use `.webp`; picture 2 uses `.jpg`. Keep these filenames stable
after printing. These pictures are public; do not put credentials in `assets`.
Keep organiser answer mappings in backend content, not in frontend source.

Assignments cycle through posters 1–9 by the team's stable `teamNumber`.
Multiple teams can use the same poster; do not remove posters after scanning.
Poster locations and riddles live in `backend/src/content/public.ts`.
The organiser overview shows each team's QR poster number beside its other variant groups.

Deploying the frontend alone does not update existing Firestore puzzle content.
With Admin SDK credentials stored outside the repository and the Firebase project
environment configured, preview the targeted update:

```bash
npm run firestore:seed --prefix backend -- --word-puzzles-only
```

Add `--apply` to update puzzle IV's team content, answer data, hints, rewards,
and emergency picture links. This mode preserves progress (including existing
puzzle-IV solves), hint usage, browser bindings, release schedules/overrides,
and all other puzzles. Do not use a full seed or progress reset for this change.
Deploy this content update together with the frontend word-entry form.

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
waiting screen with only the countdown and anticipatory text. That screen checks on initial load,
at the stored release deadline, or on explicit refresh, not on a recurring poll.
The release gate covers every route for signed-in teams, including direct URL
navigation and unknown paths, except `/admin`, which retains its organiser authentication.
Signed-out users can still reach login and organiser authentication.
During the initial release-status check, the lantern-night backdrop appears without a
spinner or countdown. Unreleased teams retain that same backdrop as the timer emerges;
teams with an open question go to their destination without a timer-screen flash.
The release gate, countdown, and game pages use one team-scoped progress source, so the timer
and dashboard render together without a second fetch shifting the content down.
Dashboard and core puzzle routes also retain the same background, header, and countdown during
navigation. Only the page content fades in, with a centered loading state while a puzzle is fetched;
reduced-motion preferences disable the reveal animation.
The waiting screen has a dedicated teal-and-copper lantern-night backdrop and a logout button
that clears the local team session without resetting progress or browser bindings.
Countdown digits roll smoothly; ambient and digit animations respect reduced-motion preferences.
The full-screen waiting view reveals its sky over five seconds, then brings the timer
out of a soft haze over 5.5 seconds, with a delayed caption. Logout and errors remain
immediately available; the entrance does not delay release checks or navigation.
The same decorative floating lanterns appear on the landing and login pages, while those pages
retain their existing layout and backgrounds.
Landing and login share a persistent background shell so decorative animations do not restart
between those routes. Their lantern layer is viewport-sized to avoid shifts when content height changes.
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

### Testing the scoring clock

The production trial on 5 November is complete. Production is restored to
**10 November 2026**, with Questions 1–6 scheduled for **1:00, 1:30, 2:00,
2:30, 3:00, and 3:30 PM IST**. The shared scoring start is **1:00 PM IST**,
`unlockOverrides` is empty, and `testScoringStartAt` is removed.
`backend/src/scripts/reset-production-test.ts` is dry-run by default; `--apply`
requires an external `--backup` path and clears all team gameplay subcollections
except provisioned `puzzleRewards`/`puzzleHints`, resets browser bindings and story
visits, and preserves team identities, keys, assignments, clues and rewards.
Pass `--event` to restore the November 10 schedule and clear testing overrides
while resetting teams; without it the script prepares the historical November 5 trial.
The deployed gameplay-run marker clears prior `lostlight.*` browser drafts and
sessions once per storage area. **Reload existing tabs after the deployment and
sign in with the team keys again.** The app cannot remotely erase storage in
unloaded/old pages; cleanup occurs when the new build starts.

In the Admin page, manually **Unlock now** for Question 1 to start a shared test
clock for every team. The same Firestore server timestamp sets Question 1's
release override and `gameConfig/main.testScoringStartAt`. Admin rankings, team
scores, and status metadata use this test start instead of the scheduled event start.
The Admin page labels the active clock **Test scoring**.

To restart the test clock, **Re-lock** Question 1 and then **Unlock now** again.
Other questions' release controls do not change the scoring clock. This does not
clear progress, Vault completions, or hint penalties; reset those separately for a
fresh trial. Completions older than the new start have zero elapsed time.
If Question 1 is already unlocked, re-lock and unlock it once after deploying this change.

The normal event schedule is unchanged. Before the real event, remove
`testScoringStartAt` and review/remove test `unlockOverrides` from `gameConfig/main`
to restore scheduled releases and scoring from 10 November 2026, 1:00 PM IST.

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
