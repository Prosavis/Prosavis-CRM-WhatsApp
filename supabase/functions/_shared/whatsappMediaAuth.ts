export function isCompactJws(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed || trimmed.startsWith('sb_')) return false;
  const parts = trimmed.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function isInvalidCompactJwsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Invalid Compact JWS/i.test(message);
}
