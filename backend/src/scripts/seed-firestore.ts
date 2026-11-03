import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CHECKPOINTS, ERRAND_LOCATIONS, errandGroup, protectedPuzzle, riddleSet } from '../content/protected.js';
import { LIGHT_MESSAGES, PUBLIC_PUZZLES } from '../content/public.js';
import { SEED_TEAMS } from '../content/teams.js';
import type { ShardType } from '../content/types.js';
import { keeperSeal, shardContent, teamKey } from '../services/convergence.js';

const applyChanges = process.argv.slice(2).includes('--apply');
const includeLocalTestTeams = process.argv.slice(2).includes('--include-local-test-teams');
const supportedArguments = new Set(['--apply', '--help', '--include-local-test-teams']);
const SHARD_TYPES: ShardType[] = ['A', 'B', 'C', 'D'];

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
      const document: DocumentData = {
        ...puzzle,
        ...protectedData,
        unlockAt,
        maxHints: protectedData.hints.length,
      };
      return [String(puzzle.id), document];
    }),
  );
}

function makeCheckpointDocuments(): Map<string, DocumentData> {
  if (CHECKPOINTS.length !== 4) {
    throw new Error(`Expected exactly 4 checkpoint records; found ${CHECKPOINTS.length}.`);
  }

  return new Map(
    CHECKPOINTS.map((checkpoint, index) => {
      const id = index < 3 ? `ERRAND-${String.fromCharCode(65 + index)}` : 'POSTER-QR';
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

function makeLocalTestTeamDocuments(): Map<string, DocumentData> {
  return new Map(
    SEED_TEAMS.map((team, index) => {
      const id = `LOCAL-TEST-${index + 1}`;
      const gameKeyHash = createHash('sha256')
        .update(team.gameKey.trim().toUpperCase(), 'utf8')
        .digest('hex');
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
    console.log('Usage: npm run firestore:seed --prefix backend -- [--apply] [--include-local-test-teams]');
    console.log('Without --apply, validates and reports the documents without writing.');
    console.log('--include-local-test-teams adds four local-only fixtures as teamNumber 1–4.');
    return;
  }

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID is missing; check frontend/.env.');
  }

  const puzzleDocuments = makePuzzleDocuments();
  const checkpointDocuments = makeCheckpointDocuments();
  const localTestTeamDocuments = includeLocalTestTeams ? makeLocalTestTeamDocuments() : new Map<string, DocumentData>();
  validateDocumentSizes(puzzleDocuments, 'puzzles');
  validateDocumentSizes(checkpointDocuments, 'checkpoints');
  validateDocumentSizes(localTestTeamDocuments, 'teams');

  console.log(
    `Prepared ${puzzleDocuments.size} puzzle documents, ${checkpointDocuments.size} checkpoint documents, gameConfig/main, and ${localTestTeamDocuments.size} local test teams for project ${projectId}.`,
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

      for (const [id, document] of checkpointDocuments) {
        transaction.set(firestore.doc(`checkpoints/${id}`), document);
      }

      for (const [index, [id, expected]] of fixtureEntries.entries()) {
        const existing = fixtureSnapshots[index];
        const teamDocument: DocumentData = { ...expected };
        if (!existing.exists) {
          teamDocument.assignedUid = null;
          teamDocument.createdAt = FieldValue.serverTimestamp();
        } else {
          if (existing.get('assignedUid') === undefined) teamDocument.assignedUid = null;
          if (existing.get('createdAt') === undefined) teamDocument.createdAt = FieldValue.serverTimestamp();
        }
        transaction.set(teamCollection.doc(id), teamDocument, { merge: true });
      }
    });

    const references = [
      configRef,
      ...[...puzzleDocuments.keys()].map((id) => firestore.doc(`puzzles/${id}`)),
      ...[...checkpointDocuments.keys()].map((id) => firestore.doc(`checkpoints/${id}`)),
      ...fixtureReferences,
    ];
    const snapshots = await firestore.getAll(...references);
    if (snapshots.some((snapshot) => !snapshot.exists)) {
      throw new Error('Read-back check failed: one or more expected static or team documents are missing.');
    }

    const snapshotsByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
    const puzzleOne = snapshotsByPath.get('puzzles/1')?.data();
    const puzzleOneBlocks = puzzleOne?.blocks;
    const streetBlock = Array.isArray(puzzleOneBlocks)
      ? puzzleOneBlocks.find((block: DocumentData) => block.type === 'street')
      : undefined;
    if (streetBlock?.rangoli?.length !== 40 || streetBlock?.lamps?.length !== 10) {
      throw new Error('Read-back check failed: Puzzle 1 rangoli or lamp data is incomplete.');
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
    const organizerDocuments = allTeams.docs.map((teamSnapshot) => {
      const teamNumber = teamSnapshot.get('teamNumber');
      if (typeof teamNumber !== 'number' || !Number.isInteger(teamNumber) || teamNumber < 1) {
        throw new Error(`teams/${teamSnapshot.id} is missing a valid teamNumber; organiser data was not seeded.`);
      }
      const group = errandGroup(teamNumber);
      return {
        reference: firestore.doc(`adminTeamData/${teamSnapshot.id}`),
        data: {
          teamNumber,
          errandGroup: group,
          errandLocation: ERRAND_LOCATIONS[group],
          riddleSet: riddleSet(teamNumber),
          lanternKey: teamKey(teamNumber),
        },
      };
    });
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
    const organizerWrites = [...organizerDocuments, keeperSealDocument];
    for (let offset = 0; offset < organizerWrites.length; offset += 450) {
      const batch = firestore.batch();
      organizerWrites.slice(offset, offset + 450).forEach(({ reference, data }) => batch.set(reference, data));
      await batch.commit();
    }

    const organizerReadBack = await firestore.getAll(...organizerWrites.map(({ reference }) => reference));
    if (organizerReadBack.some((snapshot) => !snapshot.exists)) {
      throw new Error('Read-back check failed for organiser-only records.');
    }
    const keeperSealReadBack = organizerReadBack.find((snapshot) => snapshot.ref.path === 'adminGameData/keeperSeals')?.get('keeperSeals');
    if (!Array.isArray(keeperSealReadBack) || keeperSealReadBack.length !== SHARD_TYPES.length) {
      throw new Error('Read-back check failed for adminGameData/keeperSeals.');
    }

    console.log(
      `Firebase seed completed and read-back verified: ${puzzleDocuments.size} puzzles, ${checkpointDocuments.size} checkpoints, gameConfig/main, ${localTestTeamDocuments.size} local test teams, and ${organizerDocuments.length} organiser team records.`,
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
