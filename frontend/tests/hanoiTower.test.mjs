import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as hanoi from '../src/services/hanoi.ts';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/components/HanoiTower.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));

function mount({ moves = '', reducedMotion = false, save = async () => {} } = {}) {
  const slots = [];
  const animations = [];
  let cursor = 0;
  let dirty = false;
  let tree;
  let effects = [];
  const props = { moves, onChange: async (next) => {
    await save(next);
    props.moves = next;
  } };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next) => {
        const value = typeof next === 'function' ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useLayoutEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const exports = {};
  runInNewContext(source, {
    exports, Error, window: { matchMedia: () => ({ matches: reducedMotion }) },
    require: (name) => name === 'react' ? hooks : name === '../services/hanoi' ? hanoi : require(name),
  });
  function walk(node, visit) {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
    if (!node || typeof node !== 'object') return;
    visit(node);
    walk(node.props?.children, visit);
  }
  function render() {
    do {
      dirty = false; cursor = 0; effects = [];
      tree = exports.HanoiTower(props);
      walk(tree, (node) => {
        if (typeof node.ref === 'function') node.ref({
          animate: (frames, options) => {
            const animation = { frames, options, cancel() {} };
            animations.push(animation);
            return animation;
          },
        });
      });
      effects.forEach((effect) => effect());
    } while (dirty);
  }
  const nodes = (predicate) => {
    const found = [];
    walk(tree, (node) => { if (predicate(node)) found.push(node); });
    return found;
  };
  const buttons = () => nodes((node) => node.type === 'button');
  render();
  return {
    props, animations, render, buttons,
    click: (index) => { buttons()[index].props.onClick(); render(); },
    status: () => nodes((node) => node.props?.role === 'status')[0].props.children,
  };
}

test('a move waits for durable save, then travels above the pegs and locks overlapping input', async () => {
  let acknowledge;
  let saves = 0;
  const tower = mount({ save: () => { saves++; return new Promise((resolve) => { acknowledge = resolve; }); } });
  tower.click(0);
  tower.click(1);
  assert.equal(saves, 1);
  assert.equal(tower.props.moves, '');
  assert.equal(tower.animations.length, 0, 'uncommitted moves must not travel');
  assert.ok(tower.buttons().every((button) => button.props.disabled));
  tower.click(2);
  tower.click(3);
  assert.equal(saves, 1, 'saving locks both moves and restart');
  acknowledge();
  await tick();
  tower.render();
  assert.equal(tower.props.moves, '01');
  assert.equal(tower.animations.length, 1);
  const animation = tower.animations[0];
  assert.equal(animation.options.duration, 950);
  assert.match(animation.frames[1].transform, /150px, 60px/);
  assert.match(animation.frames[2].transform, /450px, 60px/);
  assert.ok(tower.buttons().every((button) => button.props.disabled));
  animation.onfinish();
  tower.render();
  assert.ok(tower.buttons().every((button) => !button.props.disabled));
});

test('restoring a saved tower does not replay a crossing; reduced-motion moves are instant', async () => {
  const restored = mount({ moves: '0102' });
  assert.equal(restored.animations.length, 0);
  const tower = mount({ reducedMotion: true });
  tower.click(0);
  tower.click(2);
  await tick();
  tower.render();
  assert.equal(tower.props.moves, '02');
  assert.equal(tower.animations.length, 0);
  assert.ok(tower.buttons().every((button) => !button.props.disabled));
});

test('failed saves keep the previous board and report the failure without a stuck animation', async () => {
  const tower = mount({ save: async () => { throw new Error('Save failed: reconnect'); } });
  tower.click(0);
  tower.click(1);
  await tick();
  tower.render();
  assert.equal(tower.props.moves, '');
  assert.equal(tower.animations.length, 0);
  assert.match(tower.status(), /Save failed: reconnect/);
  assert.ok(tower.buttons().slice(0, 3).every((button) => !button.props.disabled));
});

test('restart is persisted and illegal placements never reach the save callback', async () => {
  const saves = [];
  const tower = mount({ moves: '01', save: async (next) => { saves.push(next); } });
  tower.click(0);
  tower.click(1);
  assert.equal(saves.length, 0);
  assert.match(tower.status(), /never place a larger disk/);
  tower.click(3);
  await tick();
  tower.render();
  assert.deepEqual(saves, ['']);
  assert.equal(tower.props.moves, '');
  assert.equal(tower.animations.length, 0);
});
