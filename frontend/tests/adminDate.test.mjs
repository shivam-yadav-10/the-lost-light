import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('organiser timestamps show both calendar date and time in IST, including midnight rollover', () => {
  const source = ts.transpileModule(readFileSync(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(`${source}\nexports.fmt = fmt;`, { exports, Date, require: () => ({}) });
  assert.equal(exports.fmt(null), '—');
  const sameDay = exports.fmt('2026-11-07T14:59:00Z');
  assert.match(sameDay, /07 Nov 2026/);
  assert.match(sameDay, /20:29/);
  const nextDay = exports.fmt('2026-11-07T20:00:00Z');
  assert.match(nextDay, /08 Nov 2026/);
  assert.match(nextDay, /01:30/);
});
