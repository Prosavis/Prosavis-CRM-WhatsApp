import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const FUNCTIONS = join(__dirname, '../../supabase/functions');

const SHUTDOWN_MODEL_IDS = [
  'gemini-3-pro-preview',
  'gemini-3-pro-image-preview',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.1-flash-image',
];

const SAMPLING_ASSIGNMENT = /\b(temperature|topK|topP|thinkingBudget)\s*:/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (full.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('Gemini request guard', () => {
  it('does not send sampling fields or call shutdown models', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(FUNCTIONS)) {
      const text = readFileSync(file, 'utf8');
      const label = relative(FUNCTIONS, file).replace(/\\/g, '/');
      if (SAMPLING_ASSIGNMENT.test(text)) {
        violations.push(`${label}: asigna temperature, topK, topP o thinkingBudget`);
      }
      for (const modelId of SHUTDOWN_MODEL_IDS) {
        if (modelId === 'gemini-2.0-flash' && text.includes('gemini-2.0-flash-lite')) {
          const withoutLite = text.replaceAll('gemini-2.0-flash-lite', '');
          if (!withoutLite.includes(modelId)) continue;
        }
        if (text.includes(modelId)) {
          violations.push(`${label}: usa el modelo retirado ${modelId}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
