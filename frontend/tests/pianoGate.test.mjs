import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as piano from '../src/services/piano.ts';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/components/PianoGate.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));

function mount({ save = async () => {}, audioFails = false } = {}) {
  const slots = [];
  const handlers = new Map();
  const timers = new Map();
  const tones = [];
  let cursor = 0;
  let clock = 0;
  let nextTimer = 0;
  let tree;
  let unlocks = 0;
  let closes = 0;
  let effects = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!deps || !previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  class AudioContext {
    currentTime = 0;
    destination = {};
    async resume() { if (audioFails) throw new Error('Audio blocked'); }
    async close() { closes++; }
    createOscillator() {
      const frequency = { value: 0 };
      return { frequency, connect() {}, disconnect() {}, start() { tones.push(frequency.value); }, stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {} };
    }
  }
  const exports = {};
  runInNewContext(source, {
    exports, Error, AudioContext, HTMLElement: class HTMLElement {},
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    window: { addEventListener: (name, handler) => handlers.set(name, handler),
      removeEventListener: (name, handler) => { if (handlers.get(name) === handler) handlers.delete(name); } },
    require: (name) => {
      if (name === 'react') return hooks;
      if (name === '../services/piano') return piano;
      if (name === '../api/client') return { api: { unlockPiano: save } };
      return require(name);
    },
  });
  function render() {
    cursor = 0; effects = [];
    tree = exports.PianoGate({ teamDocId: 'TEAM-001', onUnlocked: async () => { unlocks++; } });
    effects.forEach((effect) => effect());
  }
  function nodes(predicate) {
    const found = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (predicate(node)) found.push(node);
      walk(node.props?.children);
    }
    walk(tree);
    return found;
  }
  const buttons = () => nodes((node) => node.type === 'button');
  render();
  return {
    tones, buttons, get unlocks() { return unlocks; },
    status: () => nodes((node) => node.props?.role === 'status')[0].props.children,
    async tap(key) { buttons()[1 + piano.PIANO_KEYS.indexOf(key)].props.onClick(); await tick(); render(); },
    async listen() { buttons()[0].props.onClick(); await tick(); render(); },
    async press(key, repeat = false) {
      handlers.get('keydown')?.({ key, repeat, preventDefault() {} });
      await tick(); render();
    },
    async advance(ms) {
      const end = clock + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); clock = next[1].at; next[1].callback();
        await tick(); render();
      }
      clock = end;
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    get timerCount() { return timers.size; },
    get handlerCount() { return handlers.size; },
    get closes() { return closes; },
  };
}

test('listening plays all eight pitches, blocks entry, then accepts physical keys and opens only after saving', async () => {
  const saves = [];
  const gate = mount({ save: async (id, notes) => saves.push({ id, notes }) });
  const melody = piano.teamMelody('TEAM-001');
  await gate.listen();
  assert.ok(gate.buttons().every((button) => button.props.disabled));
  await gate.press(melody[0]);
  assert.equal(gate.tones.length, 1);
  await gate.advance(5200);
  assert.deepEqual(gate.tones, melody.map((key) => piano.PIANO_FREQUENCIES[piano.PIANO_KEYS.indexOf(key)]));
  assert.ok(gate.buttons().every((button) => !button.props.disabled));
  await gate.press(melody[0], true);
  assert.equal(gate.tones.length, 8, 'held keys must not insert repeated notes');
  for (const note of melody) await gate.press(note.toLowerCase());
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, 'TEAM-001');
  assert.equal(saves[0].notes.join(''), melody.join(''));
  assert.equal(gate.unlocks, 1);
  gate.unmount();
  assert.equal(gate.timerCount, 0);
  assert.equal(gate.handlerCount, 0);
  assert.equal(gate.closes, 1);
});

test('wrong notes restart touch attempts; failed saves show the error and allow a complete retry', async () => {
  let fail = true;
  const gate = mount({ save: async () => { if (fail) throw new Error('Offline: reconnect'); } });
  const melody = piano.teamMelody('TEAM-001');
  await gate.tap(melody[0]);
  await gate.tap(piano.PIANO_KEYS.find((key) => key !== melody[1]));
  assert.match(gate.status(), /broke the melody/);
  assert.equal(gate.unlocks, 0);
  for (const note of melody) await gate.tap(note);
  assert.match(gate.status(), /Offline: reconnect/);
  assert.equal(gate.unlocks, 0);
  assert.ok(gate.buttons().every((button) => !button.props.disabled));
  fail = false;
  for (const note of melody) await gate.tap(note);
  assert.equal(gate.unlocks, 1);
  gate.unmount();
});

test('audio errors are explicit and leaving during playback cancels the melody and keyboard listener', async () => {
  const failed = mount({ audioFails: true });
  await failed.listen();
  assert.match(failed.status(), /Audio blocked/);
  assert.ok(failed.buttons().every((button) => !button.props.disabled));
  assert.equal(failed.unlocks, 0);
  failed.unmount();
  const gate = mount();
  await gate.listen();
  gate.unmount();
  await gate.advance(6000);
  assert.equal(gate.tones.length, 1);
  assert.equal(gate.handlerCount, 0);
});
