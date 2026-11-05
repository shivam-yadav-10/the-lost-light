import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

test('the landing entry has no eager Firebase, API client, progress provider, or gameplay pages', () => {
  const visited = new Set();
  const external = new Set();
  const deferred = new Set();
  const options = { moduleResolution: ts.ModuleResolutionKind.Bundler };
  function visit(file) {
    file = path.resolve(file);
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        deferred.add(node.arguments[0].text);
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && !node.isTypeOnly && !node.importClause?.isTypeOnly) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith('.')) {
          const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
          if (resolved) visit(resolved.resolvedFileName);
        } else {
          external.add(specifier);
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  visit(path.join(sourceRoot, 'main.tsx'));
  assert.ok(visited.has(path.join(sourceRoot, 'pages', 'LandingPage.tsx')));
  assert.equal([...external].some((name) => name.startsWith('firebase/')), false);
  assert.equal(visited.has(path.join(sourceRoot, 'api', 'client.ts')), false);
  assert.equal(visited.has(path.join(sourceRoot, 'store', 'ProgressProvider.tsx')), false);
  for (const page of ['AdminPage', 'CheckpointPage', 'ConvergencePage', 'DashboardPage',
    'EndgamePages', 'LoginPage', 'PuzzlePage', 'StoryPage', 'VaultPage']) {
    assert.equal(visited.has(path.join(sourceRoot, 'pages', `${page}.tsx`)), false, `${page} must not load eagerly`);
    assert.ok(deferred.has(`./pages/${page}`), `${page} must remain reachable on demand`);
  }
  assert.ok(deferred.has('./store/ProgressProvider'));
});

test('lazy page failures are logged and render an explicit reload action', () => {
  const React = require('react');
  const exports = {};
  const errors = [];
  let reloads = 0;
  runInNewContext(ts.transpileModule(readFileSync(path.join(sourceRoot, 'App.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    console: { error: (...args) => errors.push(args) },
    window: { location: { reload: () => { reloads++; } } },
    require: (name) => {
      if (name === 'react') return { ...React, useEffect: () => {} };
      if (name === 'react/jsx-runtime') return require(name);
      return new Proxy({}, { get: (_target, key) => key });
    },
  });
  const app = exports.App();
  const boundaryElement = app.props.children.props.children;
  const boundary = new boundaryElement.type(boundaryElement.props);
  assert.equal(boundary.render(), boundaryElement.props.children);
  const suspense = boundary.render();
  assert.equal(suspense.type, React.Suspense);
  assert.equal(suspense.props.fallback.type().props.bare, true);
  boundary.state = boundaryElement.type.getDerivedStateFromError();
  const error = new Error('Chunk download failed');
  boundary.componentDidCatch(error, { componentStack: 'Lazy route' });
  assert.equal(errors[0][1], error);
  const alert = boundary.render().props.children;
  assert.equal(alert.props.role, 'alert');
  alert.props.children[1].props.onClick();
  assert.equal(reloads, 1);
});
