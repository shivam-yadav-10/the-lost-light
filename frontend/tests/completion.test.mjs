import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const transpile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('completion access requires a solved Vault from the server, never cached or local progress', async () => {
  let status;
  let offline = false;
  const reads = [];
  const exports = {};
  runInNewContext(transpile('../src/services/completionAccess.ts'), {
    exports, Error,
    require: (name) => {
      if (name === 'firebase/firestore') return {
        doc: (_db, ...segments) => segments.join('/'),
        getDocFromServer: async (path) => {
          reads.push(path);
          if (offline) throw new Error('Server unavailable');
          return { get: () => status };
        },
      };
      if (name === './authService') return { initializeSession: async () => {} };
      if (name === './firebase') return { requireFirebaseServices: () => ({ firestore: {} }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  for (status of [undefined, 'in_progress', 'locked', 'SOLVED']) {
    assert.equal(await exports.canEnterCompletion('agni'), false);
  }
  status = 'solved';
  assert.equal(await exports.canEnterCompletion('agni'), true);
  assert.ok(reads.every((path) => path === 'teams/agni/progress/8'));
  offline = true;
  await assert.rejects(exports.canEnterCompletion('agni'), /Server unavailable/);
  await assert.rejects(exports.canEnterCompletion(''), /team is required/);
});

function pageFixture(check, teamId = 'agni') {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  const Layout = () => {};
  const Navigate = () => {};
  const exports = {};
  runInNewContext(transpile('../src/pages/EndgamePages.tsx'), {
    exports, Error,
    require: (name) => {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-router-dom') return { Navigate, Link: () => {} };
      if (name === '../store/team') return { useTeam: () => ({ session: teamId ? { teamDocId: teamId } : null }) };
      if (name === '../services/completionAccess') return { canEnterCompletion: check };
      if (name === '../components/Layout') return { Layout };
      const symbol = name.split('/').at(-1);
      return { [symbol]: () => {} };
    },
  });
  return {
    Layout, Navigate,
    render() {
      cursor = 0; effects = [];
      const tree = exports.CompletionPage();
      effects.forEach((effect) => effect());
      return tree;
    },
  };
}

test('direct /complete access shows no finale while checking and redirects unsolved teams to the Vault', async () => {
  const page = pageFixture(async () => false);
  const initial = page.render();
  assert.equal(initial.type, page.Layout);
  assert.notEqual(initial.props.lanterns, true);
  await tick();
  const result = page.render();
  assert.equal(result.type, page.Navigate);
  assert.equal(result.props.to, '/vault');
  assert.equal(result.props.replace, true);
});

test('solved teams see the staged celebration with lanterns and fireworks; unsigned teams go to login', async () => {
  const page = pageFixture(async () => true);
  page.render();
  await tick();
  const finale = page.render();
  assert.equal(finale.type.name, 'CompletionCelebration');
  const celebration = finale.type();
  assert.equal(celebration.props.lanterns, true);
  assert.equal(celebration.props.children[0].type.name, 'FinaleFireworks');
  const unsigned = pageFixture(async () => true, null);
  assert.equal(unsigned.render().props.to, '/login');
});

test('server errors cannot reveal the finale and offer an explicit retry', async () => {
  const page = pageFixture(async () => { throw new Error('Network unavailable'); });
  page.render();
  await tick();
  const result = page.render();
  assert.equal(result.type, page.Layout);
  assert.notEqual(result.props.lanterns, true);
  assert.equal(result.props.children.props.role, 'alert');
});

test('fireworks limit frame rate and stop for hidden tabs, reduced motion, and unmount', () => {
  let cleanup;
  let frames = 0;
  let strokes = 0;
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  const motion = {
    matches: false,
    addEventListener: (_event, callback) => listeners.set('motion', callback),
    removeEventListener: () => listeners.delete('motion'),
  };
  const context = {
    setTransform() {}, clearRect() { frames++; },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++; },
  };
  const canvas = { getContext: () => context };
  const document = {
    visibilityState: 'visible',
    addEventListener: (_event, callback) => listeners.set('visibility', callback),
    removeEventListener: () => listeners.delete('visibility'),
  };
  const window = {
    innerWidth: 1280, innerHeight: 900, devicePixelRatio: 3,
    matchMedia: () => motion,
    requestAnimationFrame: (callback) => { pending.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id) => pending.delete(id),
    addEventListener: (_event, callback) => listeners.set('resize', callback),
    removeEventListener: () => listeners.delete('resize'),
  };
  const exports = {};
  runInNewContext(transpile('../src/components/FinaleFireworks.tsx'), {
    exports, window, document, performance: { now: () => 0 },
    require: (name) => name === 'react' ? {
      useRef: () => ({ current: canvas }),
      useEffect: (callback) => { cleanup = callback(); },
    } : require(name),
  });
  exports.FinaleFireworks();
  assert.equal(canvas.width, 1920, 'DPR is capped at 1.5');
  assert.equal(pending.size, 1);
  function advance(now) {
    const [id, callback] = pending.entries().next().value;
    pending.delete(id);
    callback(now);
  }
  advance(40);
  const drawn = frames;
  advance(50);
  assert.equal(frames, drawn, 'frames less than 33ms apart are skipped');
  advance(800);
  assert.equal(strokes, 32);
  document.visibilityState = 'hidden';
  listeners.get('visibility')();
  assert.equal(pending.size, 0);
  document.visibilityState = 'visible';
  listeners.get('visibility')();
  assert.equal(pending.size, 1);
  motion.matches = true;
  listeners.get('motion')();
  assert.equal(pending.size, 0);
  motion.matches = false;
  listeners.get('motion')();
  cleanup();
  assert.equal(pending.size, 0);
  assert.equal(listeners.size, 0);
});
