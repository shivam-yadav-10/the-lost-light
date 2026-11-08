import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('player initialization never initializes organiser Auth; admin access initializes it once on demand', () => {
  const apps = [];
  const auths = [];
  const exports = {};
  const source = readFileSync(new URL('../src/services/firebase.ts', import.meta.url), 'utf8')
    .replace(/import\.meta\.env\.VITE_FIREBASE_[A-Z_]+/g, '"fixture"')
    .replaceAll('import.meta.env.DEV', 'false');
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require: (name) => {
      if (name === 'firebase/app') return {
        getApps: () => apps,
        initializeApp: (_config, name = '[DEFAULT]') => { const app = { name }; apps.push(app); return app; },
      };
      if (name === 'firebase/auth') return { getAuth: (app) => { auths.push(app.name); return { app }; } };
      if (name === 'firebase/firestore') return { getFirestore: (app) => ({ app }) };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  assert.deepEqual(auths, ['[DEFAULT]']);
  exports.requireFirebaseServices();
  assert.deepEqual(auths, ['[DEFAULT]']);
  const admin = exports.requireAdminFirebaseServices();
  assert.equal(admin.auth.app.name, 'organizer');
  assert.equal(exports.requireAdminFirebaseServices(), admin);
  assert.deepEqual(auths, ['[DEFAULT]', 'organizer']);
});
