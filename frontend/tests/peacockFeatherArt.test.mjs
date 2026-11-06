import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

test('countdown artwork uses unique SVG definitions, layered relief and no runtime animation loop', () => {
  let nextId = 0;
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/PeacockFeatherArt.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (name) => {
      if (name === 'react') return { useId: () => `art-${++nextId}` };
      if (name === 'react/jsx-runtime') return require(name);
      throw new Error(`Unexpected artwork dependency: ${name}`);
    },
  });
  function elements(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
  }
  const first = exports.PeacockFeatherArt();
  const second = exports.PeacockFeatherArt();
  assert.equal(first.props['aria-hidden'], 'true');
  const nodes = elements(first);
  const svg = nodes.find((node) => node.type === 'svg');
  assert.equal(svg.props.focusable, 'false');
  assert.equal(svg.props.viewBox, '0 0 520 430');
  const ids = new Set(nodes.map((node) => node.props?.id).filter(Boolean));
  assert.equal(ids.size, 2);
  const uses = nodes.filter((node) => node.type === 'use');
  assert.equal(uses.length, 4);
  assert.ok(uses.every((node) => ids.has(node.props.href.slice(1))));
  assert.ok(elements(second).every((node) => !node.props?.id || !ids.has(node.props.id)));
  assert.equal(nodes.some((node) => ['image', 'canvas', 'animate'].includes(node.type)), false);
});

test('artwork belongs only to the full-screen waiting view and respects reduced motion', () => {
  const waiting = readFileSync(new URL('../src/components/WaitingRoom.tsx', import.meta.url), 'utf8');
  const clock = readFileSync(new URL('../src/components/GameClock.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(waiting, /<PeacockFeatherArt\s*\/>/);
  assert.equal(waiting.includes('KrishnaCounterArt'), false);
  assert.equal(clock.includes('PeacockFeatherArt'), false);
  assert.match(css, /@keyframes feather-relief-breathe/);
  assert.match(css, /@keyframes feather-glow-breathe/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.feather-counter-relief, \.feather-counter-aura \{ animation: none !important; \}/);
});
