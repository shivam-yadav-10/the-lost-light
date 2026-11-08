import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function fixture(development) {
  const code = ts.transpileModule(readFileSync(new URL('../src/services/firestoreReads.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.DEV', String(development)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const window = {};
  const references = [];
  runInNewContext(code, {
    exports, window, Object,
    require: () => ({
      getDoc: async (ref) => { references.push(ref); return 'document'; },
      getDocs: async (ref) => { references.push(ref); return 'query'; },
      getDocFromServer: async (ref) => { references.push(ref); return 'server'; },
    }),
  });
  return { service: exports, window, references };
}

test('development counters expose only logical operation totals and reset without caching reads', async () => {
  const f = fixture(true);
  const ref = { path: 'fixture' };
  assert.equal(await f.service.readDocument(ref), 'document');
  assert.equal(await f.service.readDocument(ref), 'document');
  assert.equal(await f.service.readQuery(ref), 'query');
  assert.equal(await f.service.readServerDocument(ref), 'server');
  f.service.recordTransactionRead();
  assert.deepEqual({ ...f.window.lostlightReadCounts.snapshot() }, { documentReads: 3, queries: 1, transactionReads: 1 });
  assert.equal(f.references.length, 4);
  f.window.lostlightReadCounts.reset();
  assert.deepEqual({ ...f.window.lostlightReadCounts.snapshot() }, { documentReads: 0, queries: 0, transactionReads: 0 });
});

test('production performs the same reads without publishing a counter API', async () => {
  const f = fixture(false);
  await f.service.readDocument({});
  f.service.recordTransactionRead();
  assert.equal(f.references.length, 1);
  assert.equal('lostlightReadCounts' in f.window, false);
});
