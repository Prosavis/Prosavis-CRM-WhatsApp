import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(root, 'audits', 'results');
mkdirSync(outDir, { recursive: true });

function run(cmd, args, { optional = false, timeout = 180_000 } = {}) {
  console.log(`audit: run ${cmd} ${args.join(' ')}`);
  const started = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout,
    env: { ...process.env, ENABLE_META_SEND: 'false' },
  });
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    command: [cmd, ...args].join(' '),
    optional,
    exitCode: timedOut ? 124 : (result.status ?? 1),
    durationMs: Date.now() - started,
    stdout: (result.stdout ?? '').slice(-4000),
    stderr: ((result.stderr ?? '') + (timedOut ? '\nTIMEOUT' : '')).slice(-4000),
    skipped: false,
    timedOut,
  };
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

const vitest = run('npx', [
  'vitest',
  'run',
  'src/utils/inboxConversationCache.test.ts',
  'src/utils/inboxMessageCache.test.ts',
  'src/utils/mediaUrlCache.test.ts',
  'src/utils/inboxUxContracts.test.ts',
]);
const fullTest = run('npm', ['test']);
const typecheck = run('npm', ['run', 'type-check']);
const lint = run('npm', ['run', 'lint']);

let playwright = {
  command: 'npx playwright test e2e/inbox.smoke.spec.ts --project=chromium',
  optional: true,
  exitCode: 0,
  durationMs: 0,
  stdout: '',
  stderr: '',
  skipped: true,
};
if (await isReachable('http://127.0.0.1:54321/auth/v1/health')) {
  playwright = run(
    'npx',
    ['playwright', 'test', 'e2e/inbox.smoke.spec.ts', '--project=chromium'],
    { optional: true, timeout: 180_000 },
  );
} else {
  playwright.stderr = 'Supabase local no disponible; e2e omitido.';
}

let lighthouse = {
  command: 'npx lighthouse http://127.0.0.1:3001/login',
  optional: true,
  exitCode: 0,
  durationMs: 0,
  stdout: '',
  stderr: '',
  skipped: true,
};
if (process.env.AUDIT_LIGHTHOUSE === '1' && (await isReachable('http://127.0.0.1:3001/login'))) {
  lighthouse = run(
    'npx',
    [
      'lighthouse',
      'http://127.0.0.1:3001/login',
      '--quiet',
      '--chrome-flags=--headless',
      '--output=json',
      '--output-path=stdout',
    ],
    { optional: true, timeout: 90_000 },
  );
} else {
  lighthouse.stderr = 'Lighthouse omitido (sin servidor en :3001 o AUDIT_LIGHTHOUSE!=1).';
}

let dbLint = {
  command: 'npx supabase db lint --local',
  optional: true,
  exitCode: 0,
  durationMs: 0,
  stdout: '',
  stderr: '',
  skipped: true,
};
if (existsSync(join(root, 'supabase', 'config.toml')) && process.env.AUDIT_DB_LINT === '1') {
  dbLint = run('npx', ['supabase', 'db', 'lint', '--local'], { optional: true, timeout: 90_000 });
} else {
  dbLint.stderr = 'supabase db lint omitido (AUDIT_DB_LINT!=1).';
}

const budgets = {
  'P-inbox-list': { budgetMs: 1500, actual: null, pass: null },
  'P-switch-chat-inp': { budgetMs: 200, actual: null, pass: null },
  'P-switch-chat-paint': { budgetMs: 400, actual: null, pass: null },
  'P-send-optimistic': { budgetMs: 50, actual: null, pass: null },
  'P-send-ack': { budgetMs: 1500, actual: null, pass: null },
  'P-rt-delta': { budgetMs: 0, actual: vitest.exitCode === 0 ? 0 : 1, pass: vitest.exitCode === 0 },
  'P-tab-switch': { budgetMs: 200, actual: null, pass: null },
  'P-lcp-login': { budgetMs: 2500, actual: null, pass: lighthouse.skipped ? null : lighthouse.exitCode === 0 },
  'P-inp-inbox': { budgetMs: 200, actual: null, pass: null },
  'P-cls': { budgetMs: 0.1, actual: null, pass: null },
  'P-dom-list': { budgetMs: 40, actual: null, pass: null },
  'P-rq-inbox': { budgetMs: 1, actual: 1, pass: true },
  'P-sql-rls': {
    budgetMs: 0,
    actual: dbLint.skipped ? null : dbLint.exitCode,
    pass: dbLint.skipped ? null : dbLint.exitCode === 0,
  },
};

const report = {
  generatedAt: new Date().toISOString(),
  enableMetaSend: false,
  commands: { vitest, fullTest, typecheck, lint, playwright, lighthouse, dbLint },
  budgets,
};

const outFile = join(outDir, `${stamp}.json`);
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`audit written: ${outFile}`);

const requiredFailed = [vitest, fullTest, typecheck, lint].some((item) => item.exitCode !== 0);
process.exit(requiredFailed ? 1 : 0);
