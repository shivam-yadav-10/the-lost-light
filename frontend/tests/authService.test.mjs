import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/services/authService.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ configured = true, signIn = async () => ({ user: { uid: 'new-user' } }) } = {}) {
  let callback;
  let observations = 0;
  let signIns = 0;
  let signOuts = 0;
  const exports = {};
  runInNewContext(code, {
    exports, Error,
    require: (name) => {
      if (name === 'firebase/auth') return {
        onAuthStateChanged: (_auth, listener) => {
          observations++;
          callback = listener;
          return () => {};
        },
        signInAnonymously: () => { signIns++; return signIn(); },
        signOut: async () => { signOuts++; callback(null); },
      };
      if (name === './firebase') return {
        firebaseAuth: configured ? {} : null,
        requireFirebaseServices: () => {
          if (!configured) throw new Error('Game services are not connected yet.');
          return { auth: {} };
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    service: exports,
    emit: (user) => callback(user),
    get observations() { return observations; },
    get signIns() { return signIns; },
    get signOuts() { return signOuts; },
  };
}

test('auth observation starts on first use and waits for persisted user restoration', async () => {
  const auth = fixture();
  assert.equal(auth.observations, 0);
  let resolved = false;
  const first = auth.service.initializeSession().then((user) => { resolved = true; return user; });
  assert.equal(auth.observations, 1);
  await Promise.resolve();
  assert.equal(resolved, false);
  auth.emit({ uid: 'restored-user' });
  assert.equal((await first).uid, 'restored-user');
  assert.equal(await auth.service.getCurrentUid(), 'restored-user');
  assert.equal(auth.observations, 1);
  assert.equal(auth.signIns, 0);
  auth.emit({ uid: 'changed-user' });
  assert.equal(await auth.service.getCurrentUid(), 'changed-user');
  await auth.service.logout();
  assert.equal(await auth.service.getCurrentUser(), null);
  assert.equal(auth.signOuts, 1);
});

test('concurrent requests share anonymous sign-in and failed sign-ins remain retryable', async () => {
  let resolve;
  const auth = fixture({ signIn: () => new Promise((done) => { resolve = done; }) });
  const first = auth.service.initializeSession();
  const second = auth.service.initializeSession();
  auth.emit(null);
  await Promise.resolve();
  assert.equal(auth.signIns, 1);
  resolve({ user: { uid: 'anonymous-user' } });
  assert.equal((await first).uid, 'anonymous-user');
  assert.equal((await second).uid, 'anonymous-user');

  let attempts = 0;
  const retry = fixture({ signIn: async () => {
    if (++attempts === 1) throw new Error('Offline');
    return { user: { uid: 'retry-user' } };
  } });
  const failure = retry.service.initializeSession();
  retry.emit(null);
  await assert.rejects(failure, /Offline/);
  assert.equal((await retry.service.initializeSession()).uid, 'retry-user');
});

test('unconfigured Firebase reports the friendly error without observing or signing in', async () => {
  const auth = fixture({ configured: false });
  await assert.rejects(auth.service.initializeSession(), /Game services are not connected yet/);
  await assert.rejects(auth.service.getCurrentUser(), /Game services are not connected yet/);
  assert.equal(auth.observations, 0);
  assert.equal(auth.signIns, 0);
});
