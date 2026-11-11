#!/usr/bin/env node
// Lee líneas JSON de suggest-timing por stdin e imprime p50 y p95 por etapa.
// Uso: Get-Content logs.jsonl | node scripts/suggest-timing-percentiles.mjs

import { createInterface } from 'node:readline';

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

const stages = new Map();
const rl = createInterface({ input: process.stdin });

for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const row = JSON.parse(trimmed);
  const source = row.stages ?? row;
  for (const [name, value] of Object.entries(source)) {
    const ms = typeof value === 'number' ? value : value?.ms;
    if (typeof ms !== 'number') continue;
    const bucket = stages.get(name) ?? [];
    bucket.push(ms);
    stages.set(name, bucket);
  }
}

const report = {};
for (const [name, values] of stages) {
  report[name] = {
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  };
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
