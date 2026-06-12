/** Paleta para iniciales de una sola letra (A–Z + ?). */
const LETTER_COLORS: Record<string, string> = {
  A: '#e53935',
  B: '#8e24aa',
  C: '#3949ab',
  D: '#1e88e5',
  E: '#00897b',
  F: '#43a047',
  G: '#7cb342',
  H: '#c0ca33',
  I: '#fdd835',
  J: '#ffb300',
  K: '#fb8c00',
  L: '#f4511e',
  M: '#6d4c41',
  N: '#546e7a',
  O: '#d81b60',
  P: '#5e35b1',
  Q: '#039be5',
  R: '#00acc1',
  S: '#00897b',
  T: '#7cb342',
  U: '#c0ca33',
  V: '#ffb300',
  W: '#6d4c41',
  X: '#8e24aa',
  Y: '#3949ab',
  Z: '#1e88e5',
  '?': '#78909c',
};

/** Paleta extendida para pares de iniciales (hash determinista). */
const PAIR_COLOR_PALETTE = [
  '#1976d2',
  '#388e3c',
  '#d32f2f',
  '#f57c00',
  '#7b1fa2',
  '#00796b',
  '#c2185b',
  '#455a64',
  '#5c6bc0',
  '#26a69a',
  '#ef6c00',
  '#8d6e63',
  '#ec407a',
  '#29b6f6',
  '#66bb6a',
  '#ab47bc',
  '#ffa726',
  '#26c6da',
  '#9ccc65',
  '#ff7043',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getContactInitials(name?: string | null, phone?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
    }
    if (parts[0]) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }
  const phoneDigits = phone?.replace(/\D/g, '') ?? '';
  if (phoneDigits.length >= 2) {
    return phoneDigits.slice(-2);
  }
  return '?';
}

export function getContactAvatarColor(initials: string): string {
  const normalized = initials.trim().toUpperCase();
  if (!normalized || normalized === '?') {
    return LETTER_COLORS['?'];
  }
  if (normalized.length === 1) {
    return LETTER_COLORS[normalized] ?? LETTER_COLORS['?'];
  }
  return PAIR_COLOR_PALETTE[hashString(normalized) % PAIR_COLOR_PALETTE.length];
}

export function pickContactPhotoUrl(
  directoryPhoto?: string | null,
  conversationPhoto?: string | null,
): string | undefined {
  const dir = directoryPhoto?.trim();
  if (dir) return dir;
  const conv = conversationPhoto?.trim();
  if (conv) return conv;
  return undefined;
}
