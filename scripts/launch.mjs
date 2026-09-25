import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://127.0.0.1:3000/';
const isWindows = process.platform === 'win32';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function portOccupied() {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3000 });
    socket.setTimeout(2500);
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
    socket.once('timeout', () => {
      socket.destroy();
      done(false);
    });
  });
}

function sourceChangedSinceBuild() {
  const buildId = resolve(root, '.next', 'BUILD_ID');
  if (!existsSync(buildId)) return true;
  const builtAt = statSync(buildId).mtimeMs;
  const visit = (path) => {
    if (!existsSync(path)) return false;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return readdirSync(path).some((entry) => visit(resolve(path, entry)));
    }
    return stat.mtimeMs > builtAt;
  };
  return [
    'app',
    'components',
    'lib',
    'next.config.ts',
    'package.json',
    '.env.local',
    '.env.production.local',
  ].some((entry) => visit(resolve(root, entry)));
}

async function stopStaleLocalServer() {
  if (process.platform !== 'darwin') return false;
  const listener = spawnSync('lsof', ['-t', '-nP', '-iTCP:3000', '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (listener.status !== 0) return false;
  const pids = listener.stdout.trim().split(/\s+/).map(Number);
  if (pids.length !== 1 || !Number.isSafeInteger(pids[0])) return false;
  const pid = pids[0];
  const cwd = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    encoding: 'utf8',
  });
  const command = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], {
    encoding: 'utf8',
  });
  if (
    cwd.status !== 0 ||
    !cwd.stdout.split('\n').includes(`n${root}`) ||
    command.status !== 0 ||
    !/\bnext-server\b|next[\\/]dist[\\/]bin[\\/]next/.test(command.stdout)
  )
    return false;

  console.log('Stopping the previous Feeder server so the changed files can be built…');
  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!(await portOccupied())) return true;
    await pause(200);
  }
  return false;
}

async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const html = await response.text();
    if (!response.ok || !html.includes('Feeder · Your interests, your feed')) {
      return { occupied: true, healthy: false };
    }
    const assets = [
      ...new Set(
        [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)[^"]*"/g)].map(
          (match) => match[1],
        ),
      ),
    ];
    if (!assets.length) return { occupied: true, healthy: false };
    try {
      for (const asset of assets.slice(0, 8)) {
        const check = await fetch(new URL(asset, url), {
          method: 'HEAD',
          signal: AbortSignal.timeout(2500),
        });
        if (!check.ok) return { occupied: true, healthy: false };
      }
    } catch {
      return { occupied: true, healthy: false };
    }
    return { occupied: true, healthy: true };
  } catch {
    return { occupied: await portOccupied(), healthy: false };
  }
}

function pnpmInvocation(args) {
  return isWindows
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] }
    : { command: 'pnpm', args };
}

function runPnpm(args) {
  const { command, args: commandArgs } = pnpmInvocation(args);
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed`);
}

function openBrowser() {
  const launchUrl = `${url}?launch=${Date.now()}`;
  if (isWindows) {
    spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${launchUrl}"`], {
      cwd: root,
      stdio: 'ignore',
      detached: true,
    }).unref();
  } else {
    spawn('open', [launchUrl], { cwd: root, stdio: 'ignore' }).unref();
  }
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22 || (nodeMajor === 22 && Number(process.versions.node.split('.')[1]) < 13)) {
  throw new Error('Feeder needs Node.js 22.13 or newer.');
}
let first = await probe();
if (first.occupied && (!first.healthy || sourceChangedSinceBuild())) {
  if (await stopStaleLocalServer()) first = { occupied: false, healthy: false };
}
if (first.occupied) {
  if (!first.healthy) {
    throw new Error(
      'Port 3000 is used by another or incomplete server. Close it, then launch Feeder again.',
    );
  }
  if (sourceChangedSinceBuild()) {
    throw new Error('Feeder files changed. Close the server on port 3000, then launch again.');
  }
  console.log('Feeder is already running. Opening the existing page.');
  openBrowser();
} else {
  const versionCommand = pnpmInvocation(['--version']);
  const version = spawnSync(versionCommand.command, versionCommand.args, {
    cwd: root,
    stdio: 'ignore',
  });
  if (version.error || version.status !== 0) {
    throw new Error('Install pnpm 11.19 and add it to PATH, then launch Feeder again.');
  }
  if (!existsSync(resolve(root, 'node_modules', 'next'))) {
    console.log('Installing Feeder dependencies…');
    runPnpm(['install', '--frozen-lockfile']);
  }
  console.log('Building Feeder…');
  runPnpm(['build']);
  console.log(`Starting Feeder at ${url}`);
  const startCommand = pnpmInvocation(['start']);
  const server = spawn(startCommand.command, startCommand.args, { cwd: root, stdio: 'inherit' });
  let exited = false;
  let startError = null;
  server.on('error', (error) => {
    startError = error;
    exited = true;
  });
  server.on('exit', () => {
    exited = true;
  });
  let ready = false;
  let readyChecks = 0;
  for (let attempt = 0; attempt < 60 && !exited; attempt += 1) {
    await pause(1000);
    const state = await probe();
    readyChecks = state.healthy ? readyChecks + 1 : 0;
    if (readyChecks >= 2) {
      ready = true;
      break;
    }
  }
  if (!ready)
    throw startError ?? new Error('Feeder did not become ready. Check the server output above.');
  openBrowser();
  console.log('Feeder is ready. Keep this window open; Ctrl+C stops the server.');
  if (!exited) await new Promise((done) => server.once('exit', done));
}
