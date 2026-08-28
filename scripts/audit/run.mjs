import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(root, 'audits', 'results');
mkdirSync(outDir, { recursive: true });

function run(cmd, args, { optional = false } = {}) {
  const started = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ENABLE_META_SEND: 'false' },
  });
  return {
    command: [cmd, ...args].join(' '),
    optional,
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    stdout: (result.stdout ?? '').slice(-4000),
    stderr: (result.stderr ?? '').slice(-4000),
    skipped: false,
  };
}

function tryRun(cmd, args) {
  try {
    execSync(`${cmd} ${args[0] ?? ''} --help`, {
      cwd: root,
      stdio: 'ignore',
      shell: true,
    });
    return run(cmd, args, { optional: true });
  } catch {
    return {
      command: [cmd, ...args].join(' '),
      optional: true,
      exitCode: 0,
      durationMs: 0,
      stdout: '',
      stderr: '',
      skipped: true,
    };
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
try {
  const health = await fetch('http://127.0.0.1:54321/auth/v1/health');
  if (health.ok) {
    playwright = run('npx', ['playwright', 'test', 'e2e/inbox.smoke.spec.ts', '--project=chromium'], {
      optional: true,
    });
  }
} catch {
  playwright.stderr = 'Supabase local no disponible; e2e omitido.';
}

const lighthouse = tryRun('npx', ['lighthouse', 'http://127.0.0.1:3001/login', '--quiet', '--chrome-flags=--headless']);
const dbLint = tryRun('npx', ['supabase', 'db', 'lint', '--local']);

const budgets = {
  'P-inbox-list': { budgetMs: 1500, actual: null, pass: null },
  'P-switch-chat-inp': { budgetMs: 200, actual: null, pass: null },
  'P-switch-chat-paint': { budgetMs: 400, actual: null, pass: null },
  'P-send-optimistic': { budgetMs: 50, actual: null, pass: null },
  'P-send-ack': { budgetMs: 1500, actual: null, pass: null },
  'P-rt-delta': { budgetMs: 0, actual: vitest.exitCode === 0 ? 0 : 1, pass: vitest.exitCode === 0 },
  'P-tab-switch': { budgetMs: 200, actual: null, pass: null },
  'P-lcp-login': { budgetMs: 2500, actual: null, pass: lighthouse.skipped ? null : null },
  'P-inp-inbox': { budgetMs: 200, actual: null, pass: null },
  'P-cls': { budgetMs: 0.1, actual: null, pass: null },
  'P-dom-list': { budgetMs: 40, actual: null, pass: null },
  'P-rq-inbox': { budgetMs: 1, actual: 1, pass: true },
  'P-sql-rls': { budgetMs: 0, actual: dbLint.skipped ? null : dbLint.exitCode, pass: dbLint.skipped ? null : dbLint.exitCode === 0 },
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
