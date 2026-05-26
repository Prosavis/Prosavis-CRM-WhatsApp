export function formatError(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint].filter(
      (value) => typeof value === 'string' && value.length > 0,
    );
    if (parts.length) return parts.join(' — ');
  }
  return String(error);
}
