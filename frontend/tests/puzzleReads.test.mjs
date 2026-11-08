import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function compile(file) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.map((node) => find(node, predicate)).find(Boolean);
  if (!tree || typeof tree !== 'object') return null;
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}

test('Convergence manual arrival refresh deduplicates concurrent requests and permits retry after failure', async () => {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let reads = 0;
  let resolve;
  let reject;
  const session = { teamDocId: 'TEAM-001', teamId: 1 };
  const puzzle = { id: 7, state: 'AVAILABLE', blocks: [], maxHints: 3, revealedHints: [] };
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => dep !== slots[i].deps[index])) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => dep !== slots[i].deps[index])) {
        slots[i] = { deps };
        effects.push(callback);
      }
    },
  };
  const exports = {};
  runInNewContext(compile('../src/pages/ConvergencePage.tsx'), {
    exports, Error,
    require: (name) => {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === '../api/client') return { api: { convergence: () => {
        reads++;
        return new Promise((success, failure) => { resolve = success; reject = failure; });
      } } };
      if (name === '../store/useProgress') return { useProgress: () => ({
        progress: { puzzles: [{ kind: 'convergence', state: 'AVAILABLE', id: 7 }], fragments: [] },
      }) };
      if (name === '../store/team') return { useTeam: () => ({ session }) };
      if (name === '../store/usePuzzle') return { usePuzzle: () => ({ puzzle }) };
      if (name === '../services/convergenceOverlay') return { cardsAligned: () => false };
      return new Proxy({}, { get: (_target, key) => key });
    },
  });
  const open = exports.ConvergencePage();
  function render() {
    cursor = 0; effects = [];
    const tree = open.type(open.props);
    effects.forEach((effect) => effect());
    return tree;
  }
  render();
  assert.equal(reads, 1);
  resolve({ partners: [{ teamId: 'TEAM-002', name: 'Partner', verified: false, arrived: false }], seal: 'seal' });
  await tick();
  let tree = render();
  const refresh = find(tree, (node) => node.type === 'button' && node.props.children === 'Refresh arrivals');
  refresh.props.onClick();
  refresh.props.onClick();
  assert.equal(reads, 2, 'two clicks share one pending request');
  reject(new Error('Offline'));
  await tick();
  tree = render();
  assert.ok(find(tree, (node) => node.props?.role === 'alert'));
  find(tree, (node) => node.type === 'button' && node.props.children === 'Refresh arrivals').props.onClick();
  assert.equal(reads, 3, 'a failed request must not lock manual refresh permanently');
  resolve({ partners: [{ teamId: 'TEAM-002', name: 'Partner', verified: false, arrived: true }], seal: 'seal' });
  await tick();
  tree = render();
  assert.equal(find(tree, (node) => node.props?.role === 'alert'), undefined);
});

test('dashboard marker claims rely on confirmed updates, never a full progress reload', () => {
  let reads = 0;
  const exports = {};
  runInNewContext(compile('../src/pages/DashboardPage.tsx'), {
    exports,
    require: (name) => {
      if (name === 'react/jsx-runtime') return require(name);
      if (name === '../store/useProgress') return { useProgress: () => ({
        progress: null, refresh: async () => { reads++; },
      }) };
      if (name === '../store/team') return { useTeam: () => ({ session: { teamName: 'Fixture' } }) };
      if (name === 'react-router-dom') return { Link: 'link', useLocation: () => ({}) };
      if (name === '../components/CheckpointForm') return { CheckpointForm: 'checkpoint' };
      if (name === '../services/gameRules') return { MAX_TEAM_HINTS: 12 };
      return new Proxy({}, { get: (_target, key) => key });
    },
  });
  const checkpoint = find(exports.DashboardPage(), (node) => node.type === 'checkpoint');
  assert.equal(checkpoint.props.onRedeemed, undefined);
  assert.equal(reads, 0);
});

test('asking for a hint updates its confirmed allowance and text without a second dashboard fetch', async () => {
  let refreshes = 0;
  const hints = [];
  const exports = {};
  runInNewContext(compile('../src/components/HintSection.tsx'), {
    exports,
    require: (name) => {
      if (name === 'react') return {
        useState: (value) => [value === null ? 0 : value, () => {}],
        useEffect: (effect) => effect(),
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === '../store/team') return { useTeam: () => ({ session: { teamDocId: 'TEAM-001' } }) };
      if (name === '../store/useProgress') return { useProgress: () => ({
        progress: { puzzles: [{ hintsUsed: 0 }] }, error: null, refresh: () => { refreshes++; },
      }) };
      if (name === '../services/gameRules') return { MAX_TEAM_HINTS: 12 };
      if (name === '../api/client') return {
        ApiError: class extends Error {},
        api: { hint: async () => ({ hints: ['Confirmed hint'], hintsUsed: 1, teamHintsUsed: 1 }) },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const tree = exports.HintSection({ puzzleId: 1, maxHints: 3, hintsUsed: 0,
    revealedHints: [], onHints: (text, used) => hints.push({ text, used }) });
  find(tree, (node) => node.type === 'button').props.onClick();
  await tick();
  assert.equal(hints.length, 1);
  assert.equal(hints[0].used, 1);
  assert.equal(refreshes, 0);
});
