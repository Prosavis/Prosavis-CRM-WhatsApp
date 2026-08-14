/** Convierte secuencias escapadas de Gemini/JSON en saltos reales. */
export function unescapeInboxAiNewlines(value: string): string {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Limpia el texto de sugerencia para el composer de WhatsApp.
 * Preserva párrafos y listas; no aplasta saltos a un solo espacio.
 */
export function cleanInboxAiSuggestionText(value: unknown): string {
  if (typeof value !== 'string') return '';

  return unescapeInboxAiNewlines(value)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
