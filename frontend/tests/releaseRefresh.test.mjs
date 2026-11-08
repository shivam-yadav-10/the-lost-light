import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { GAMEPLAY_RUN } from '../src/services/gameplayRun.ts';

const require = createRequire(import.meta.url);
const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const releaseSource = compile('../src/services/releaseRefresh.ts');
const providerSource = compile('../src/store/ProgressProvider.tsx');
const adminSource = compile('../src/pages/AdminPage.tsx');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
  let now = Date.parse('2026-11-10T07:00:00Z');
  let timerId = 0;
  const timers = new Map();
  const listeners = new Map();
  const storage = new Map();
  const warnings = [];
  const window = {
    sessionStorage: { setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
    dispatchEvent: (event) => listeners.get(event.type)?.forEach((callback) => callback(event)),
  };
  class Clock extends Date { static now() { return now; } }
  const globals = {
    Date: Clock, Error, Event, window, console: { warn: (...args) => warnings.push(args) },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval() { throw new Error('Recurring polling must not be installed'); },
  };
  const release = {};
  runInNewContext(releaseSource, {
    ...globals, exports: release,
    require: (name) => name === './gameplayRun' ? { GAMEPLAY_RUN } : require(name),
  });
  return {
    globals, release, storage, listeners, timers, warnings,
    get now() { return now; },
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].callback();
        await tick();
      }
      now = end;
      await tick();
    },
    emit(name, event = {}) { listeners.get(name)?.forEach((callback) => callback(event)); },
  };
}

function mount(source, exportedName, f, modules) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  const hooks = {
    ...require('react'),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => dep !== slots[i].deps[index])) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useMemo(callback, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => dep !== slots[i].deps[index])) slots[i] = { deps, value: callback() };
      return slots[i].value;
    },
    useEffect(callback, deps) {
      const i = cursor++;
      const old = slots[i];
      if (!old || deps.some((dep, index) => dep !== old.deps[index])) {
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; });
      }
    },
  };
  const exports = {};
  runInNewContext(source, {
    ...f.globals, exports,
    require: (name) => name === 'react' ? hooks : name in modules ? modules[name] : require(name),
  });
  function render() {
    cursor = 0; effects = [];
    tree = exports[exportedName]({ children: 'children' });
    effects.forEach((effect) => effect());
  }
  render();
  return { render, get tree() { return tree; }, unmount: () => slots.forEach((slot) => slot?.cleanup?.()) };
}

function teamProvider(f, fetch, options = {}) {
  const session = { teamDocId: 'TEAM-001', teamId: 1 };
  const signOut = () => {};
  return mount(providerSource, 'ProgressProvider', f, {
    '../services/progressService': { getTeamProgress: fetch, refreshPuzzleProgress: options.light ?? fetch,
      clearProgressModel() {}, projectTeamProgress: options.project ?? (() => null) },
    'react-router-dom': { useLocation: () => ({ pathname: options.pathname ?? '/waiting' }) },
    '../services/teamService': { TeamLoginError: class TeamLoginError extends Error {} },
    './team': { useTeam: () => ({ session, signOut }) },
    './useProgress': { ProgressContext: { Provider: 'provider' } },
    '../services/releaseRefresh': f.release,
    '../services/stableContent': { clearStableContent() {} },
  });
}

  test('puzzle release deadlines and an hour of idling do not request database progress', async () => {
    const f = fixture();
    let reads = 0;
    let projections = 0;
    const target = f.now + 60_000;
    const provider = teamProvider(f, async () => { reads++; return progress(target); }, {
      pathname: '/puzzle/3', project: () => { projections++; return { puzzles: [{ id: 1, state: 'AVAILABLE', unlockAt: null }] }; },
    });
    await tick(); provider.render();
    await f.advance(3_600_000); provider.render();
    assert.equal(reads, 1);
    assert.equal(projections, 1, 'release updates are computed locally, not fetched');
    provider.unmount();
  });

  test('confirmed actions patch progress without fetching, ignore other teams, and survive an in-flight stale refresh', async () => {
    const f = fixture();
    let reads = 0;
    let finish;
    const applied = [];
    const confirmed = { puzzles: [{ id: 1, state: 'SOLVED', unlockAt: null }] };
    const provider = teamProvider(f, () => {
      reads++;
      return new Promise((resolve) => { finish = resolve; });
    }, { pathname: '/puzzle/1', project: (_team, update) => { applied.push(update); return confirmed; } });
    f.emit('lostlight:progress-confirmed', { detail: { teamDocId: 'TEAM-002' } });
    assert.equal(applied.length, 0);
    const update = { teamDocId: 'TEAM-001', puzzle: { id: 1 } };
    f.emit('lostlight:progress-confirmed', { detail: update });
    finish({ puzzles: [{ id: 1, state: 'AVAILABLE', unlockAt: null }] });
    await tick(); provider.render();
    assert.equal(reads, 1);
    assert.equal(provider.tree.props.value.progress, confirmed);
    assert.equal(applied.length, 2, 'action is reapplied after the older request resolves');
    provider.unmount();
  });
const progress = (target) => ({ puzzles: [{ id: 1, state: 'LOCKED', unlockAt: new Date(target).toISOString() }] });

test('light refresh keeps cached display, deduplicates clicks and queues a requested full refresh', async () => {
  const f = fixture();
  let fullReads = 0;
  let lightReads = 0;
  let finish;
  const state = { puzzles: [{ id: 1, state: 'AVAILABLE', unlockAt: null }] };
  const provider = teamProvider(f, async () => { fullReads++; return state; }, {
    pathname: '/dashboard',
    light: () => { lightReads++; return new Promise((resolve) => { finish = resolve; }); },
  });
  await tick(); provider.render();
  const value = provider.tree.props.value;
  const first = value.refreshPuzzles();
  const second = value.refreshPuzzles();
  provider.render();
  assert.equal(first, second);
  assert.equal(provider.tree.props.value.progress, state);
  assert.equal(provider.tree.props.value.loading, true);
  const full = value.refresh();
  assert.equal(fullReads, 1);
  finish(state);
  await full; provider.render();
  assert.equal(lightReads, 1);
  assert.equal(fullReads, 2, 'full refresh must not be swallowed by an in-flight light refresh');
  assert.equal(provider.tree.props.value.loading, false);
  provider.unmount();
});

test('waiting progress fetches once on mount, stores its team/run time, and only fetches again at zero', async () => {
  const f = fixture();
  const target = f.now + 600_000;
  let reads = 0;
  const provider = teamProvider(f, async () => { reads++; return progress(target); });
  await tick(); provider.render();
  assert.equal(reads, 1);
  assert.equal(f.storage.get(`lostlight.release.${GAMEPLAY_RUN}.TEAM-001`), String(target));
  f.emit('focus'); f.emit('visibilitychange');
  await f.advance(599_999); provider.render();
  assert.equal(reads, 1, 'ticks, focus and tab visibility must not fetch progress');
  await f.advance(101); provider.render();
  assert.equal(reads, 2);
  assert.equal(f.storage.size, 0, 'expired release timestamp is removed after checking');
  await f.advance(3_600_000); provider.render();
  assert.equal(reads, 2, 'zero refresh is one-shot, not a recurring loop');
  provider.unmount();
  assert.equal(f.timers.size, 0);
});

test('Ctrl+Shift+R is trapped once, held keys and simultaneous events share the in-flight request', async () => {
  const f = fixture();
  let reads = 0;
  let finish;
  const provider = teamProvider(f, () => {
    reads++;
    return new Promise((resolve) => { finish = resolve; });
  });
  const event = { key: 'R', ctrlKey: true, shiftKey: true, repeat: false, preventDefault() { this.prevented = true; } };
  f.emit('keydown', event);
  f.emit('lostlight:progress-updated');
  assert.equal(event.prevented, true);
  assert.equal(reads, 1);
  finish(progress(f.now + 600_000)); await tick(); provider.render();
  f.emit('keydown', { ...event, repeat: true });
  assert.equal(reads, 1);
  f.emit('keydown', { ...event, defaultPrevented: true });
  assert.equal(reads, 1, 'focused puzzle controls retain their existing Ctrl+Shift+R shortcut');
  f.emit('keydown', { ...event, shiftKey: false });
  assert.equal(reads, 1, 'normal Ctrl+R is left to the browser');
  f.emit('keydown', event);
  assert.equal(reads, 2);
  finish(progress(f.now + 600_000)); await tick(); provider.render();
  provider.unmount();
  f.emit('keydown', event);
  assert.equal(reads, 2, 'unmount removes the shortcut');
});

test('changed schedule replaces the deadline; failed release fetch does not retry and manual retry recovers', async () => {
  const f = fixture();
  let target = f.now + 60_000;
  let fail = false;
  let reads = 0;
  const provider = teamProvider(f, async () => {
    reads++;
    if (fail) throw new Error('Quota exhausted');
    return progress(target);
  });
  await tick(); provider.render();
  target = f.now + 120_000;
  await provider.tree.props.value.refresh(); provider.render();
  await f.advance(60_100); provider.render();
  assert.equal(reads, 2, 'old deadline must be cancelled');
  fail = true;
  await f.advance(60_000); provider.render();
  assert.equal(reads, 3);
  assert.equal(provider.tree.props.value.error, 'Quota exhausted');
  await f.advance(600_000); provider.render();
  assert.equal(reads, 3, 'errors do not cause repeated reads');
  fail = false;
  await provider.tree.props.value.refresh(); provider.render();
  assert.equal(provider.tree.props.value.error, null);
  provider.unmount();
});

test('storage failure logs a warning but the one-shot countdown still refreshes', async () => {
  const f = fixture();
  f.globals.window.sessionStorage.setItem = () => { throw new Error('Storage disabled'); };
  const target = f.now + 10_000;
  let reads = 0;
  const provider = teamProvider(f, async () => { reads++; return progress(target); });
  await tick(); provider.render();
  assert.equal(f.warnings.length, 1);
  await f.advance(10_100); provider.render();
  assert.equal(reads, 2);
  provider.unmount();
});

test('long waits re-arm locally without early database reads and can be cancelled', async () => {
  const f = fixture();
  let reads = 0;
  const target = f.now + 3_000_000_000;
  const cancel = f.release.scheduleReleaseRefresh(target, () => { reads++; });
  await f.advance(2_147_483_647);
  assert.equal(reads, 0);
  assert.equal(f.timers.size, 1);
  cancel();
  await f.advance(3_000_000_000);
  assert.equal(reads, 0);
});

test('admin overview loads once, never installs interval polling, and refreshes only on request', async () => {
  const f = fixture();
  let reads = 0;
  const admin = mount(adminSource, 'AdminPage', f, {
    '../services/adminService': {
      getCurrentAdminUid: async () => 'admin',
      getAdminOverview: async () => { reads++; return null; },
      getAdminErrorMessage: (error) => error.message,
    },
    '../services/gameRules': { formatDuration: () => '' },
  });
  await tick(); admin.render(); await tick(); admin.render();
  assert.equal(reads, 1);
  await f.advance(3_600_000); admin.render();
  assert.equal(reads, 1);
  function findRefresh(node) {
    if (Array.isArray(node)) return node.map(findRefresh).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && node.props.children === 'Refresh') return node;
    return findRefresh(node.props?.children);
  }
  const button = findRefresh(admin.tree);
  assert.ok(button);
  button.props.onClick();
  button.props.onClick();
  await tick(); admin.render();
  assert.equal(reads, 2, 'repeated clicks while loading must not duplicate requests');
  admin.unmount();
});

test('waiting gate stays at zero until refreshed progress arrives and honours a postponed release', async () => {
  const f = fixture();
  const firstRelease = f.now + 1000;
  let state = progress(firstRelease);
  const gate = mount(`${compile('../src/App.tsx')}\nexports.ReleaseGate = ReleaseGate;`, 'ReleaseGate', f, {
    'react-router-dom': { useLocation: () => ({ pathname: '/waiting' }), Navigate: 'navigate' },
    './store/useProgress': { useProgress: () => ({ progress: state, error: null, refresh: async () => {} }) },
    './services/gameClock': {
      hasReleasedQuestion: (puzzles, now) => puzzles.some((p) => p.state !== 'LOCKED' || Date.parse(p.unlockAt) <= now),
      nextRelease: (puzzles, now) => puzzles.find((p) => p.state === 'LOCKED' && Date.parse(p.unlockAt) > now),
    },
    './components/GameClock': { useClockNow: () => f.now, ReleaseCountdown: 'countdown' },
    './components/WaitingRoom': { WaitingRoom: 'waiting' },
    './components/Layout': { Layout: 'layout' },
    './services/browserRestrictions': {},
    './pages/LandingPage': {},
    './store/team': {},
    // App's lazy routes are declared but never loaded by this test.
  });
  assert.equal(gate.tree.type, 'waiting');
  await f.advance(1100); gate.render();
  assert.equal(gate.tree.type, 'waiting', 'local zero alone must not open the dashboard');
  assert.equal(gate.tree.props.children[1].props.target, firstRelease);
  state = progress(f.now + 60_000); gate.render();
  assert.equal(gate.tree.type, 'waiting');
  assert.equal(gate.tree.props.children[1].props.target, f.now + 60_000);
  state = { puzzles: [{ ...state.puzzles[0], state: 'AVAILABLE' }] };
  gate.render();
  assert.equal(gate.tree.type, 'navigate');
  assert.equal(gate.tree.props.to, '/dashboard');
  gate.unmount();
});
