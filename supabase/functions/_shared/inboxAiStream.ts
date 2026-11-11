/** Lee un string JSON incompleto. Si la comilla de cierre no llegó, devuelve lo ya decodificado. */
export function extractPartialJsonString(buffer: string, field: string): string | null {
  const key = `"${field}"`;
  const keyAt = buffer.indexOf(key);
  if (keyAt < 0) return null;

  let index = keyAt + key.length;
  while (index < buffer.length && /\s/.test(buffer[index] ?? '')) index += 1;
  if (buffer[index] !== ':') return null;
  index += 1;
  while (index < buffer.length && /\s/.test(buffer[index] ?? '')) index += 1;
  if (buffer[index] !== '"') return null;
  index += 1;

  let out = '';
  while (index < buffer.length) {
    const char = buffer[index] ?? '';
    if (char === '\\') {
      if (index + 1 >= buffer.length) return out;
      const next = buffer[index + 1] ?? '';
      if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === 't') out += '\t';
      else if (next === 'u') {
        if (index + 5 >= buffer.length) return out;
        const code = Number.parseInt(buffer.slice(index + 2, index + 6), 16);
        out += Number.isFinite(code) ? String.fromCharCode(code) : '';
        index += 6;
        continue;
      } else {
        out += next;
      }
      index += 2;
      continue;
    }
    if (char === '"') return out;
    out += char;
    index += 1;
  }
  return out;
}
