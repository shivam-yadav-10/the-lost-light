import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CHECKPOINTS, ERRAND_LOCATIONS, errandGroup, protectedPuzzle, riddleSet, variantKey } from '../content/protected.js';
import { LIGHT_MESSAGES, PUBLIC_PUZZLES } from '../content/public.js';
import { SEED_TEAMS } from '../content/teams.js';
import type { ShardType } from '../content/types.js';
import { buildLantern, keeperSeal, shardContent, teamKey, teamSeal } from '../services/convergence.js';
import { normaliseAnswer } from '../services/normalise.js';
import { provisionConvergence } from './provision-convergence.js';
import { provisionWordPuzzles } from './provision-word-puzzles.js';

const applyChanges = process.argv.slice(2).includes('--apply');
const includeLocalTestTeams = process.argv.slice(2).includes('--include-local-test-teams');
const convergenceOnly = process.argv.slice(2).includes('--convergence-only');
const wordPuzzlesOnly = process.argv.slice(2).includes('--word-puzzles-only');
const supportedArguments = new Set(['--apply', '--help', '--include-local-test-teams', '--convergence-only', '--word-puzzles-only']);
const SHARD_TYPES: ShardType[] = ['A', 'B', 'C', 'D'];

function hashValue(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizedSeal(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function compactAnswer(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validateArguments(): void {
  const unexpected = process.argv.slice(2).filter((argument) => !supportedArguments.has(argument));
  if (unexpected.length > 0) {
    throw new Error(`Unsupported argument(s): ${unexpected.join(', ')}. Use --help for usage.`);
  }
}

function validateCredentialsLocation(): void {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) return;

  if (!existsSync(credentialPath)) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS does not point to an existing file.');
  }

  const repositoryRoot = resolve(process.cwd(), '..');
  const resolvedCredentialPath = realpathSync(credentialPath);
  const relativePath = relative(repositoryRoot, resolvedCredentialPath);
  if (relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))) {
    throw new Error('Keep the Admin SDK credential file outside the repository.');
  }
}

function makePuzzleDocuments(): Map<string, DocumentData> {
  return new Map(
    PUBLIC_PUZZLES.map((puzzle) => {
      const protectedData = protectedPuzzle(puzzle.id);
      const unlockAt = puzzle.unlockAt ? Timestamp.fromDate(new Date(puzzle.unlockAt)) : null;
      const { intro: _intro, blocks: _blocks, variants: _variants, ...metadata } = puzzle;
      const document: DocumentData = {
        ...metadata,
        unlockAt,
        maxHints: protectedData.hints.length,
        hintPenalties: protectedData.hints.map((hint) => hint.penaltyMinutes),
      };
      return [String(puzzle.id), document];
    }),
  );
}

function makePrivatePuzzleDocuments(): Map<string, DocumentData> {
  return new Map(PUBLIC_PUZZLES.map((puzzle) => {
    const secret = protectedPuzzle(puzzle.id);
    const normalizedAnswersByGroup = Object.fromEntries(
      Object.entries(secret.answersByGroup ?? {}).map(([group, answers]) => [
        group,
        answers.map(compactAnswer),
      ]),
    );
    return [
      String(puzzle.id),
      {
        ...secret,
        acceptedAnswers: secret.answers.map(normaliseAnswer),
        acceptedAnswersByGroup: normalizedAnswersByGroup,
        unlockAt: puzzle.unlockAt ? Timestamp.fromDate(new Date(puzzle.unlockAt)) : null,
        requires: puzzle.requires,
        maxHints: secret.hints.length,
      },
    ];
  }));
}

function makeTeamPuzzleContentDocuments(team: { id: string; teamNumber: number }): Array<{ id: string; data: DocumentData }> {
  return PUBLIC_PUZZLES.map((puzzle) => {
    const groups = Object.keys(puzzle.variants ?? {});
    const group = groups.length > 0 ? variantKey(team.teamNumber, groups) : null;
    return {
      id: `${team.id}_${puzzle.id}`,
      data: {
        teamId: team.id,
        puzzleId: String(puzzle.id),
        intro: puzzle.intro,
        blocks: [...puzzle.blocks, ...(group ? puzzle.variants?.[group] ?? [] : [])],
      },
    };
  });
}

function makeTeamPuzzleRewards(): Array<{ id: number; data: DocumentData }> {
  return PUBLIC_PUZZLES.map((puzzle) => {
    const secret = protectedPuzzle(puzzle.id);
    return {
      id: puzzle.id,
      data: {
        ...(secret.fragment ? { fragment: secret.fragment } : {}),
        completionMessage: secret.completionMessage,
      },
    };
  });
}

function makeTeamPuzzleHints(): Array<{ id: string; data: DocumentData }> {
  return PUBLIC_PUZZLES.flatMap((puzzle) =>
    protectedPuzzle(puzzle.id).hints.map((hint, index) => ({
      id: `${puzzle.id}_${index + 1}`,
      data: { puzzleId: String(puzzle.id), hintNumber: index + 1, text: hint.text, penaltyMinutes: hint.penaltyMinutes },
    })),
  );
}

function makeCheckpointDocuments(): Map<string, DocumentData> {
  if (CHECKPOINTS.length !== 4) {
    throw new Error(`Expected exactly 4 checkpoint records; found ${CHECKPOINTS.length}.`);
  }

  return new Map(
    CHECKPOINTS.map((checkpoint) => {
      const id = hashValue(normaliseAnswer(checkpoint.code));
      return [
        id,
        {
          title: checkpoint.title,
          message: checkpoint.message,
          puzzleId: checkpoint.puzzleId,
        },
      ];
    }),
  );
}

function makeSealLookupDocuments(teamRows: Array<{ id: string; type: ShardType; seal: string }>): Map<string, DocumentData> {
  const documents = new Map<string, DocumentData>();
  for (const team of teamRows) {
    const shard = shardContent(team.type);
    documents.set(hashValue(normalizedSeal(team.seal)), {
      type: shard.type,
      name: shard.name,
      text: shard.text,
      ownerTeamId: team.id,
    });
  }
  for (const type of SHARD_TYPES) {
    const shard = shardContent(type);
    documents.set(hashValue(normalizedSeal(keeperSeal(type))), {
      type: shard.type,
      name: shard.name,
      text: shard.text,
      ownerTeamId: null,
    });
  }
  return documents;
}

function makeLocalTestTeamDocuments(): Map<string, DocumentData> {
  return new Map(
    SEED_TEAMS.map((team, index) => {
      const id = `LOCAL-TEST-${index + 1}`;
      const gameKeyHash = hashValue(team.gameKey.trim().toUpperCase());
      return [
        id,
        {
          teamName: team.name,
          gameKeyHash,
          active: true,
          teamNumber: index + 1,
        },
      ];
    }),
  );
}

function validateDocumentSizes(documents: Iterable<[string, DocumentData]>, collectionName: string): void {
  for (const [id, document] of documents) {
    const bytes = Buffer.byteLength(JSON.stringify(document), 'utf8');
    if (bytes >= 900_000) {
      throw new Error(`${collectionName}/${id} is too large to seed safely (${bytes} bytes).`);
    }
  }
}

async function seedFirestore(): Promise<void> {
  validateArguments();

  if (process.argv.slice(2).includes('--help')) {
    console.log('Usage: npm run firestore:seed --prefix backend -- [--apply] [--include-local-test-teams | --convergence-only]');
    console.log('Without --apply, validates and reports the documents without writing.');
    console.log('--include-local-test-teams adds four local-only fixtures as teamNumber 1–4.');
    console.log('--convergence-only reads the roster and reports a targeted read-only plan; add --apply to provision puzzle 7 only.');
    console.log('--word-puzzles-only reads the roster and prepares puzzle IV only; add --apply to write without resetting progress or schedules.');
    return;
  }

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID is missing; check frontend/.env.');
  }
  if (convergenceOnly || wordPuzzlesOnly) {
    if (includeLocalTestTeams || (convergenceOnly && wordPuzzlesOnly)) throw new Error('Choose exactly one targeted provisioning mode; it cannot create test teams.');
    if (convergenceOnly && !process.env.GAME_SECRET?.trim()) throw new Error('GAME_SECRET must be set before provisioning Convergence.');
    validateCredentialsLocation();
    const app = initializeApp({ credential: applicationDefault(), projectId });
    try {
      if (wordPuzzlesOnly) await provisionWordPuzzles(getFirestore(app), applyChanges);
      else await provisionConvergence(getFirestore(app), applyChanges);
    }
    finally { await deleteApp(app); }
    return;
  }

  const puzzleDocuments = makePuzzleDocuments();
  const privatePuzzleDocuments = makePrivatePuzzleDocuments();
  const checkpointDocuments = makeCheckpointDocuments();
  const localTestTeamDocuments = includeLocalTestTeams ? makeLocalTestTeamDocuments() : new Map<string, DocumentData>();
  validateDocumentSizes(puzzleDocuments, 'puzzles');
  validateDocumentSizes(privatePuzzleDocuments, 'privatePuzzles');
  validateDocumentSizes(checkpointDocuments, 'checkpoints');
  validateDocumentSizes(localTestTeamDocuments, 'teams');

  console.log(
    `Prepared ${puzzleDocuments.size} puzzle metadata documents, ${privatePuzzleDocuments.size} private puzzle documents, ${checkpointDocuments.size} hashed checkpoints, gameConfig/main, and ${localTestTeamDocuments.size} local test teams for project ${projectId}. Team-specific content and rewards are prepared after reading the team list.`,
  );
  if (!applyChanges) {
    console.log('Dry run only. No Firebase credentials were used and no documents were written. Add --apply to write.');
    return;
  }

  if (!process.env.GAME_SECRET?.trim()) {
    throw new Error('GAME_SECRET must be set in backend/.env before organiser-only key data can be seeded.');
  }

  validateCredentialsLocation();
  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
  });
  try {
    const firestore = getFirestore(app);
    const configRef = firestore.doc('gameConfig/main');
    const teamCollection = firestore.collection('teams');
    const fixtureEntries = [...localTestTeamDocuments];
    const fixtureReferences = fixtureEntries.map(([id]) => teamCollection.doc(id));

    await firestore.runTransaction(async (transaction) => {
      const configSnapshot = await transaction.get(configRef);
      const fixtureSnapshots = includeLocalTestTeams
        ? await Promise.all(fixtureReferences.map((reference) => transaction.get(reference)))
        : [];
      const numberedTeamsSnapshot = includeLocalTestTeams
        ? await transaction.get(teamCollection.where('teamNumber', 'in', [1, 2, 3, 4]))
        : null;

      if (includeLocalTestTeams) {
        const expectedTeamIdsByNumber = new Map(
          fixtureEntries.map(([id, document]) => [document.teamNumber as number, id]),
        );
        for (const snapshot of numberedTeamsSnapshot?.docs ?? []) {
          const number = snapshot.get('teamNumber') as number;
          const expectedId = expectedTeamIdsByNumber.get(number);
          if (!expectedId || snapshot.id !== expectedId) {
            throw new Error(`Team number ${number} is already assigned to an unexpected document; no team documents were changed.`);
          }
        }

        for (const [index, [id, expected]] of fixtureEntries.entries()) {
          const existing = fixtureSnapshots[index];
          if (
            existing.exists &&
            (existing.get('teamName') !== expected.teamName ||
              existing.get('gameKeyHash') !== expected.gameKeyHash ||
              existing.get('active') !== true ||
              existing.get('teamNumber') !== expected.teamNumber)
          ) {
            throw new Error(`Existing teams/${id} does not match the local test fixture; no team documents were changed.`);
          }
        }
      }

      const existingOverrides = configSnapshot.get('unlockOverrides');
      const configDocument: DocumentData = {
        name: 'The Lost Light',
        eventDate: '2026-11-10',
        timezone: 'Asia/Kolkata',
        scheduleStartAt: Timestamp.fromDate(new Date('2026-11-10T07:30:00.000Z')),
        scoringRule: 'elapsed-from-schedule-start-plus-hint-penalties',
        updatedAt: FieldValue.serverTimestamp(),
        lightMessages: LIGHT_MESSAGES,
      };

      if (existingOverrides === undefined) {
        configDocument.unlockOverrides = {};
      }

      transaction.set(configRef, configDocument, { merge: true });

      for (const [id, document] of puzzleDocuments) {
        transaction.set(firestore.doc(`puzzles/${id}`), document);
      }

      for (const [id, document] of privatePuzzleDocuments) {
        transaction.set(firestore.doc(`privatePuzzles/${id}`), document);
      }

      for (const [id, document] of checkpointDocuments) {
        transaction.set(firestore.doc(`checkpoints/${id}`), document);
      }

      for (const [index, [id, expected]] of fixtureEntries.entries()) {
        const existing = fixtureSnapshots[index];
        const teamDocument: DocumentData = { ...expected };
        if (!existing.exists) {
          teamDocument.assignedUids = [];
          teamDocument.createdAt = FieldValue.serverTimestamp();
        } else {
          if (existing.get('assignedUids') === undefined) teamDocument.assignedUids = [];
          if (existing.get('createdAt') === undefined) teamDocument.createdAt = FieldValue.serverTimestamp();
        }
        transaction.set(teamCollection.doc(id), teamDocument, { merge: true });
      }
    });

    const references = [
      configRef,
      ...[...puzzleDocuments.keys()].map((id) => firestore.doc(`puzzles/${id}`)),
      ...[...privatePuzzleDocuments.keys()].map((id) => firestore.doc(`privatePuzzles/${id}`)),
      ...[...checkpointDocuments.keys()].map((id) => firestore.doc(`checkpoints/${id}`)),
      ...fixtureReferences,
    ];
    const snapshots = await firestore.getAll(...references);
    if (snapshots.some((snapshot) => !snapshot.exists)) {
      throw new Error('Read-back check failed: one or more expected static or team documents are missing.');
    }

    const snapshotsByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
    const puzzleOne = snapshotsByPath.get('puzzles/1')?.data();
    if (
      puzzleOne?.intro !== undefined ||
      puzzleOne?.blocks !== undefined ||
      puzzleOne?.answers !== undefined ||
      puzzleOne?.hints !== undefined ||
      puzzleOne?.fragment !== undefined
    ) {
      throw new Error('Read-back check failed: puzzle content or protected data was written to metadata documents.');
    }

    for (const [id, expected] of localTestTeamDocuments) {
      const snapshot = snapshotsByPath.get(`teams/${id}`);
      if (
        !snapshot ||
        snapshot.get('teamName') !== expected.teamName ||
        snapshot.get('gameKeyHash') !== expected.gameKeyHash ||
        snapshot.get('active') !== true ||
        snapshot.get('teamNumber') !== expected.teamNumber
      ) {
        throw new Error(`Read-back check failed for teams/${id}.`);
      }
    }

    const allTeams = await teamCollection.get();
    const existingPrivateTeams = allTeams.empty ? [] : await firestore.getAll(
      ...allTeams.docs.map((team) => firestore.doc(`privateTeamData/${team.id}`)),
    );
    const existingKeys = new Map(existingPrivateTeams.map((snapshot) => [snapshot.id, snapshot.get('lanternKey')]));
    const teamRecords = allTeams.docs.map((teamSnapshot) => {
      const team = teamSnapshot.data();
      const teamNumber = teamSnapshot.get('teamNumber');
      if (typeof teamNumber !== 'number' || !Number.isInteger(teamNumber) || teamNumber < 1) {
        throw new Error(`teams/${teamSnapshot.id} is missing a valid teamNumber; organiser data was not seeded.`);
      }
      const teamName = teamSnapshot.get('teamName');
      const gameKeyHash = teamSnapshot.get('gameKeyHash');
      if (typeof teamName !== 'string' || !teamName.trim() || typeof gameKeyHash !== 'string' || !/^[a-f0-9]{64}$/.test(gameKeyHash)) {
        throw new Error(`teams/${teamSnapshot.id} is missing a valid name or game-key hash; organiser data was not seeded.`);
      }
      const existingType = teamSnapshot.get('shardType');
      const shardType = SHARD_TYPES.includes(existingType as ShardType)
        ? existingType as ShardType
        : SHARD_TYPES[(teamNumber - 1) % SHARD_TYPES.length];
      const group = errandGroup(teamNumber);
      return {
        id: teamSnapshot.id,
        teamNumber,
        teamName,
        gameKeyHash,
        active: team.active === true,
        shardType,
        lantern: buildLantern(teamNumber),
        lanternKey: existingKeys.get(teamSnapshot.id) ?? teamKey(teamNumber),
        teamSeal: teamSeal(teamNumber),
        errandGroup: group,
        riddleSet: riddleSet(teamNumber),
      };
    });
    const organizerDocuments = teamRecords.map((team) => ({
      reference: firestore.doc(`adminTeamData/${team.id}`),
      data: {
          teamNumber: team.teamNumber,
          errandGroup: team.errandGroup,
          errandLocation: ERRAND_LOCATIONS[team.errandGroup],
          riddleSet: team.riddleSet,
          lanternKey: team.lanternKey,
          teamSeal: team.teamSeal,
          lantern: team.lantern,
        },
    }));
    const playerTeamDocuments = teamRecords.flatMap((team) => [
      {
        reference: firestore.doc(`teamKeyClaims/${team.gameKeyHash}`),
        data: {
          teamId: team.id,
          teamNumber: team.teamNumber,
          teamName: team.teamName,
          active: team.active,
        },
      },
      {
        reference: firestore.doc(`teamGameData/${team.id}`),
        data: {
          shard: { ...shardContent(team.shardType), seal: team.teamSeal },
          lantern: team.lantern,
        },
      },
      {
        reference: firestore.doc(`privateTeamData/${team.id}`),
        data: { lanternKey: team.lanternKey },
      },
      {
        reference: firestore.doc(`teams/${team.id}`),
        data: {
          shardType: team.shardType,
          errandGroup: team.errandGroup,
          riddleSet: team.riddleSet,
        },
      },
      {
        reference: firestore.doc(`teams/${team.id}/verifiedShards/${team.shardType}`),
        data: {
          type: team.shardType,
          name: shardContent(team.shardType).name,
          text: shardContent(team.shardType).text,
          sealHash: hashValue(normalizedSeal(team.teamSeal)),
          verifiedAt: FieldValue.serverTimestamp(),
        },
      },
    ]);
    const sealLookupDocuments = makeSealLookupDocuments(
      teamRecords.map((team) => ({ id: team.id, type: team.shardType, seal: team.teamSeal })),
    );
    const sealLookupWrites = [...sealLookupDocuments].map(([id, data]) => ({
      reference: firestore.doc(`sealLookups/${id}`),
      data,
    }));
    const teamContentWrites = teamRecords.flatMap((team) =>
      makeTeamPuzzleContentDocuments(team).map(({ id, data }) => ({
        reference: firestore.doc(`teamPuzzleContent/${id}`),
        data,
      })),
    );
    const teamRewardWrites = teamRecords.flatMap((team) =>
      makeTeamPuzzleRewards().map(({ id, data }) => ({
        reference: firestore.doc(`teams/${team.id}/puzzleRewards/${id}`),
        data,
      })),
    );
    const teamHintWrites = teamRecords.flatMap((team) =>
      makeTeamPuzzleHints().map(({ id, data }) => ({
        reference: firestore.doc(`teams/${team.id}/puzzleHints/${id}`),
        data,
      })),
    );
    const keeperSealDocument = {
      reference: firestore.doc('adminGameData/keeperSeals'),
      data: {
        keeperSeals: SHARD_TYPES.map((type) => ({
          type,
          name: shardContent(type).name,
          seal: keeperSeal(type),
        })),
      },
    };
    const organizerWrites = [
      ...organizerDocuments,
      ...playerTeamDocuments,
      ...sealLookupWrites,
      ...teamContentWrites,
      ...teamRewardWrites,
      ...teamHintWrites,
      keeperSealDocument,
    ];
    for (let offset = 0; offset < organizerWrites.length; offset += 450) {
      const batch = firestore.batch();
      organizerWrites.slice(offset, offset + 450).forEach(({ reference, data }) => {
        batch.set(reference, data, { merge: true });
      });
      await batch.commit();
    }

    const organizerReadBack = await firestore.getAll(...organizerWrites.map(({ reference }) => reference));
    if (organizerReadBack.some((snapshot) => !snapshot.exists)) {
      throw new Error('Read-back check failed for organiser or player gameplay records.');
    }
    const keeperSealReadBack = organizerReadBack.find((snapshot) => snapshot.ref.path === 'adminGameData/keeperSeals')?.get('keeperSeals');
    if (!Array.isArray(keeperSealReadBack) || keeperSealReadBack.length !== SHARD_TYPES.length) {
      throw new Error('Read-back check failed for adminGameData/keeperSeals.');
    }
    await provisionConvergence(firestore, true);

    const fragmentBackfills = [];
    for (const teamSnapshot of allTeams.docs) {
      const progressSnapshots = await teamSnapshot.ref.collection('progress').get();
      for (const progressSnapshot of progressSnapshots.docs) {
        if (progressSnapshot.get('status') !== 'solved' || progressSnapshot.get('fragment') !== undefined) continue;
        const fragment = protectedPuzzle(Number(progressSnapshot.id)).fragment;
        if (fragment) fragmentBackfills.push({ reference: progressSnapshot.ref, fragment });
      }
    }
    for (let offset = 0; offset < fragmentBackfills.length; offset += 450) {
      const batch = firestore.batch();
      fragmentBackfills.slice(offset, offset + 450).forEach(({ reference, fragment }) => {
        batch.update(reference, { fragment });
      });
      await batch.commit();
    }

    console.log(
      `Firebase seed completed and read-back verified: ${puzzleDocuments.size} puzzle metadata documents, ${privatePuzzleDocuments.size} private puzzles, ${checkpointDocuments.size} hashed checkpoints, ${teamRecords.length} teams, ${teamContentWrites.length} team-specific content documents, ${teamRewardWrites.length} gated rewards, ${teamHintWrites.length} gated hints, and ${sealLookupDocuments.size} seal lookups.`,
    );
  } finally {
    await deleteApp(app);
  }
}

seedFirestore().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Firebase seed failed: ${message}`);
  process.exitCode = 1;
});
