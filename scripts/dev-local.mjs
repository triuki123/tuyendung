import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { checkTelegramSchema } from './check-telegram-schema.mjs';
import { checkMembershipSchema } from './check-membership-schema.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectDir);
dotenv.config({ path: '.env.local', quiet: true });
const port = Number(process.env.PORT || 4028);
const workspaceDir = path.dirname(projectDir);
const tempDir = path.join(workspaceDir, '.temp');
const npmCacheDir = path.join(workspaceDir, '.cache', 'npm');
const logDir = path.join(projectDir, 'logs');
for (const dir of [tempDir, npmCacheDir, logDir]) mkdirSync(dir, { recursive: true });

// Keep simultaneous starts from writing to the same compiler cache before the
// Next server has had time to bind its port.
const lockPath = path.join(logDir, 'localhost.lock');
if (readLockPid()) {
  const oldPid = readLockPid();
  let alive = false;
  try { process.kill(oldPid, 0); alive = true; } catch {}
  if (alive) throw new Error('Localhost is already running or starting. Run npm run restart:local.');
  unlinkSync(lockPath);
}
writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
process.on('exit', () => {
  if (readLockPid() === process.pid) unlinkSync(lockPath);
});
function readLockPid() {
  try { return Number(readFileSync(lockPath, 'utf8')); } catch { return null; }
}

await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', () => reject(new Error(`Port ${port} is already in use. Run npm run restart:local to restart this project's server.`)));
  probe.listen(port, '0.0.0.0', () => probe.close(resolve));
});

// Fail before launching the app if notification/login columns were not migrated.
// Do not silently hide errors or auto-change a deployment database at startup.
await checkTelegramSchema();
await checkMembershipSchema();

const env = {
  ...process.env,
  TEMP: tempDir,
  TMP: tempDir,
  TMPDIR: tempDir,
  npm_config_cache: npmCacheDir,
  NEXT_TELEMETRY_DISABLED: '1',
  DIST_DIR: process.env.DIST_DIR || '.next-recruitment-dev',
};
const log = createWriteStream(path.join(logDir, 'localhost.log'), { flags: 'a' });
const require = createRequire(import.meta.url);
log.write(`\n[${new Date().toISOString()}] Starting localhost from ${projectDir}; cache=${env.DIST_DIR}; temp=${tempDir}\n`);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', String(port)], {
  cwd: projectDir,
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: true,
});
let warmupStarted = false;
child.stdout.on('data', data => {
  process.stdout.write(data);
  log.write(data);
  if (!warmupStarted && /Ready in/.test(data.toString())) {
    warmupStarted = true;
    void warmRecruitmentPages().catch(error => {
      const message = `[warmup] ${error.message}\n`;
      log.write(message);
      process.stderr.write(message);
    });
  }
});
child.stderr.on('data', data => { process.stderr.write(data); log.write(data); });
child.once('error', error => { console.error(error.message); log.end(); process.exitCode = 1; });
child.once('exit', code => { log.end(); process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill(signal);
  });
}

async function warmRecruitmentPages() {
  if (env.LOCAL_DEV_BYPASS_AUTH !== 'true' || env.NEXT_PUBLIC_RECRUITMENT_FOCUS !== 'true') return;
  const origin = `http://127.0.0.1:${port}`;
  const login = await fetch(`${origin}/api/auth/dev-login`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Local sign-in is unavailable.');
  // One startup-only pass avoids making the first browser visit compile every
  // required page and endpoint. Nothing is polled in the background afterward.
  for (const route of [
    '/api/auth/me',
    '/nguon-nhan-luc/kho-ung-vien',
    '/api/hr/cv',
    '/api/hr/cv/industries',
    '/api/hr/requisitions',
    '/nguon-nhan-luc/tinh-hinh-tuyen-dung',
    '/api/hr/recruitment-dashboard',
  ]) {
    const response = await fetch(`${origin}${route}`, { headers: { cookie }, signal: AbortSignal.timeout(60_000) });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}`);
    log.write(`[warmup] HTTP ${response.status} ${route}\n`);
  }
  const message = '[warmup] Recruitment pages and APIs are ready.\n';
  log.write(message);
  process.stdout.write(message);
}
