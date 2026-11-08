import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/components/HintSection.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.map(node => find(node, predicate)).find(Boolean) ?? null;
  if (!tree || typeof tree !== 'object') return null;
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function fixture() {
  const slots = [];
  let cursor = 0;
  let calls = 0;
  let resolve;
  let reject;
  const updates = [];
  const exports = {};
  class ApiError extends Error {}
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(callback) { callback(); },
  };
  runInNewContext(source, {
    exports, require: name => {
      if (name === 'react') return hooks;
      if (name === '../api/client') return { ApiError, api: { hint: () => {
        calls++;
        return new Promise((success, failure) => { resolve = success; reject = failure; });
      } } };
      if (name === '../store/team') return { useTeam: () => ({ session: { teamDocId: 'TEAM-001' } }) };
      if (name === '../store/useProgress') return { useProgress: () => ({
        progress: { puzzles: [{ hintsUsed: 0 }] }, error: null,
        refresh: () => assert.fail('Loading feedback must not refresh progress'),
      }) };
      if (name === '../services/gameRules') return { MAX_TEAM_HINTS: 12 };
      if (name === './DiyaLamp') return { DiyaLamp: () => null };
      return require(name);
    },
  });
  const render = () => {
    cursor = 0;
    return exports.HintSection({ puzzleId: 1, maxHints: 3, hintsUsed: 0,
      revealedHints: ['Existing hint'], onHints: (...args) => updates.push(args) });
  };
  render();
  return { render, calls: () => calls, updates, resolve: () => resolve({ hints: ['New hint'], hintsUsed: 1, teamHintsUsed: 1 }),
    reject: () => reject(new ApiError('Could not reveal a hint.')) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('hint wait shows accessible animation immediately, preserves hints, and blocks duplicate purchases', async () => {
  const f = fixture();
  const button = find(f.render(), node => node.type === 'button');
  button.props.onClick();
  button.props.onClick();
  assert.equal(f.calls(), 1);
  const waiting = f.render();
  assert.ok(find(waiting, node => node.props?.role === 'status'));
  assert.equal(find(waiting, node => node.type === 'button').props.disabled, true);
  assert.ok(find(waiting, node => Array.isArray(node.props?.children) && node.props.children.includes('Existing hint')));
  f.resolve();
  await tick();
  assert.equal(f.updates.length, 1);
  assert.equal(find(f.render(), node => node.props?.role === 'status'), null);
});

test('hint errors remove waiting state, display the error and permit an explicit retry', async () => {
  const f = fixture();
  find(f.render(), node => node.type === 'button').props.onClick();
  f.reject();
  await tick();
  const failed = f.render();
  assert.equal(find(failed, node => node.props?.role === 'status'), null);
  assert.equal(find(failed, node => node.props?.role === 'alert').props.children, 'Could not reveal a hint.');
  find(failed, node => node.type === 'button').props.onClick();
  assert.equal(f.calls(), 2);
  f.resolve();
  await tick();
});
