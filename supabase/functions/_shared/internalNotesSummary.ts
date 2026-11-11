const DIARY_ENTRY_LIMIT = 3;

/**
 * Bloque [Vigente] más las últimas entradas del diario.
 * Si la hoja no tiene esa forma, devuelve null y el llamador recorta a 400 caracteres.
 */
export function buildInternalNotesSummary(
  notes: string | null | undefined,
  diaryEntries = DIARY_ENTRY_LIMIT,
): string | null {
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (!text) return null;

  const vigenteMatch = text.match(/^\[Vigente [^\]]*\][^\n]*(?:\n(?!---\n|## Diario\b)[^\n]*)*/);
  const vigente = vigenteMatch?.[0]?.trim() ?? '';
  const diarySplit = text.split(/^## Diario\s*$/m);
  const diary = diarySplit.length > 1 ? diarySplit.slice(1).join('\n') : '';
  const blocks = diary
    .split(/\n(?=### )/)
    .map((block) => block.trim())
    .filter((block) => block.startsWith('### '));
  const last = blocks.slice(-Math.max(0, diaryEntries));

  const parts = [vigente, ...last].filter((part) => part.length > 0);
  if (!parts.length) return null;
  return parts.join('\n\n');
}
