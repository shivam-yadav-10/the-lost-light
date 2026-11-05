import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/components/FragmentCard.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

test('Gold fragment label and swatch turn Green only after Convergence, without changing the word or other fragments', () => {
  let state = 'AVAILABLE';
  const exports = {};
  runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === '../store/useProgress') return {
        useProgress: () => ({ progress: { puzzles: [{ kind: 'convergence', state }] } }),
      };
      if (name === './SymbolShape') return { SymbolIcon: () => null, symbolLabel: (value) => value };
      return require(name);
    },
  });
  const fragment = { symbol: 'flame', number: 1, direction: 'SW', keyword: 'DRAWER', colour: 'Gold' };
  function values(colour = 'Gold') {
    const tree = exports.FragmentCard({ fragment: { ...fragment, colour } });
    const rows = tree.props.children[2].props.children;
    const row = rows.find((candidate) => candidate.key === 'Colour');
    return { colour: row.props.children[1].props.children[1], border: tree.props.style.borderColor };
  }
  assert.deepEqual(values(), { colour: 'Gold', border: '#d4a01766' });
  state = 'SOLVED';
  assert.deepEqual(values(), { colour: 'Green', border: '#22c55e66' });
  assert.deepEqual(values('Orange'), { colour: 'Orange', border: '#f9731666' });
  assert.equal(fragment.keyword, 'DRAWER');
  assert.equal(fragment.colour, 'Gold', 'original puzzle metadata is preserved');
  state = 'LOCKED';
  assert.equal(values().colour, 'Gold', 'resetting Convergence restores the original clue');
});
