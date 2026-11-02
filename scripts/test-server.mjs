#!/usr/bin/env node
/**
 * Fake-time test server for The Lost Light.
 *
 * Starts a separate API + web pair with a frozen game clock (FAKE_NOW) and its own database,
 * so it never touches the real dev database. If a preferred port is busy, the next free one is used.
 *
 * Usage:
 *   node scripts/test-server.mjs [--now=2026-11-10T10:00:00Z] [--keep] [--api-port=4100] [--web-port=5180]
 *
 *   --now       Fake server time (ISO). Default 2026-11-10T10:00:00Z = 15:30 IST, all six core puzzles open.
 *   --keep      Keep the existing test database instead of resetting it.
 *   --api-port  Preferred API port (default 4100).
 *   --web-port  Preferred web port (default 5180).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');
const tsxCli = path.join(backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
const MAX_PORT_TRIES = 50;

function parseArgs(argv) {
  const args = { now: '2026-11-10T10:00:00Z', keep: false, apiPort: 4100, webPort: 5180 };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'now' && value) args.now = value;
    else if (key === 'keep') args.keep = true;
    else if (key === 'api-port' && value) args.apiPort = Number(value);
    else if (key === 'web-port' && value) args.webPort = Number(value);
    else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }
  if (Number.isNaN(new Date(args.now).getTime())) {
    console.error(`--now must be an ISO timestamp, got "${args.now}"`);
    process.exit(1);
  }
  for (const port of [args.apiPort, args.webPort]) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      console.error(`Invalid port: ${port}`);
      process.exit(1);
    }
  }
  return args;
}

/**
 * True if nothing is listening on the port. Checks the all-interfaces bind (how Express listens) as well as
 * both loopbacks (how Vite listens); on Windows a loopback bind can succeed while `::` is already taken.
 */
function isPortFree(port) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err) => resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'));
      server.once('listening', () => server.close(() => resolve(true)));
      if (host === undefined) server.listen(port);
      else server.listen(port, host);
    });
  return [undefined, '127.0.0.1', '::1'].reduce(
    (previous, host) => previous.then((free) => (free ? tryHost(host) : false)),
    Promise.resolve(true),
  );
}

async function findFreePort(preferred, taken = new Set()) {
  for (let port = preferred; port < preferred + MAX_PORT_TRIES; port++) {
    if (!taken.has(port) && (await isPortFree(port))) return port;
  }
  throw new Error(`No free port found in ${preferred}-${preferred + MAX_PORT_TRIES - 1}`);
}

function requireFile(file, hint) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${path.relative(root, file)}. ${hint}`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireFile(tsxCli, 'Run `npm run install:all` first.');
  requireFile(viteCli, 'Run `npm run install:all` first.');

  const apiPort = await findFreePort(args.apiPort);
  const webPort = await findFreePort(args.webPort, new Set([apiPort]));
  // One database per instance (keyed by API port) so several test servers can run side by side.
  const dbPath = path.join(backendDir, 'data', `test-${apiPort}.db`);

  const backendEnv = {
    ...process.env,
    PORT: String(apiPort),
    DB_PATH: dbPath,
    FAKE_NOW: args.now,
    CORS_ORIGIN: `http://localhost:${webPort}`,
  };

  // Prepare the test database (reset by default so every run starts clean).
  const init = spawnSync(process.execPath, [tsxCli, '--env-file-if-exists=.env', 'src/db/init.ts', ...(args.keep ? [] : ['--reset'])], {
    cwd: backendDir,
    env: backendEnv,
    stdio: 'inherit',
  });
  if (init.status !== 0) {
    console.error('Database initialisation failed.');
    process.exit(init.status ?? 1);
  }

  const children = [];
  let stopping = false;
  function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill();
    setTimeout(() => process.exit(code), 500);
  }
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  const start = (name, cwd, cliArgs, env) => {
    const child = spawn(process.execPath, cliArgs, { cwd, env, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (!stopping) console.log(`\n[${name}] exited with code ${code ?? 'null'}; stopping the test server.`);
      shutdown(code ?? 1);
    });
    children.push(child);
  };

  start('api', backendDir, [tsxCli, 'watch', '--env-file-if-exists=.env', 'src/index.ts'], backendEnv);
  start('web', frontendDir, [viteCli, '--port', String(webPort), '--strictPort'], {
    ...process.env,
    VITE_API_PROXY: `http://localhost:${apiPort}`,
  });

  const hasEnv = fs.existsSync(path.join(backendDir, '.env'));
  const ist = new Date(new Date(args.now).getTime() + 330 * 60_000).toISOString().replace('T', ' ').slice(0, 16);
  console.log(`
============================================================
  THE LOST LIGHT: FAKE-TIME TEST SERVER
------------------------------------------------------------
  Web:        http://localhost:${webPort}
  API:        http://localhost:${apiPort}
  Admin:      http://localhost:${webPort}/#/admin   (key: ${hasEnv ? 'ADMIN_KEY in backend/.env' : 'local-admin'})
  Fake time:  ${args.now}  (${ist} IST)
  Database:   ${path.relative(root, dbPath)} ${args.keep ? '(kept)' : '(fresh)'}
  Teams:      AGNI-2026, JYOTI-2026, DEEPA-2026, PRAKASH-2026
  Press Ctrl+C to stop.
============================================================
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
