import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinePath = process.argv[2] ?? join(root, 'audits', 'baselines', 'current.json');
const latestPath = process.argv[3] ?? join(root, 'audits', 'results', 'latest.json');

if (!existsSync(latestPath)) {
  console.error(`No hay resultado reciente: ${latestPath}. Corre npm run audit.`);
  process.exit(1);
}

const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
if (!existsSync(baselinePath)) {
  console.warn(`No hay baseline en ${baselinePath}. Se acepta el latest como baseline 0.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const regressions = [];

for (const [key, next] of Object.entries(latest.budgets ?? {})) {
  const prev = baseline.budgets?.[key];
  if (!prev || next?.actual == null || prev.actual == null) continue;
  if (typeof next.actual === 'number' && typeof prev.actual === 'number' && next.actual > prev.actual) {
    regressions.push(`${key}: ${prev.actual} → ${next.actual}`);
  }
  if (prev.pass === true && next.pass === false) {
    regressions.push(`${key}: pass → fail`);
  }
}

if (regressions.length > 0) {
  console.error('Regresiones P-* vs baseline:');
  for (const line of regressions) console.error(`- ${line}`);
  process.exit(1);
}

console.log('compare: ningún P-* empeoró frente a baseline.');
