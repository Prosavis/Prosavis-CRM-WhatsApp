function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function camelKeysToSnake<T extends Record<string, unknown>>(
  input: T
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[camelToSnakeKey(key)] = value;
  }
  return output;
}

export function camelKeysToSnakeDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelKeysToSnakeDeep);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      output[camelToSnakeKey(key)] = camelKeysToSnakeDeep(nested);
    }
    return output;
  }
  return value;
}
