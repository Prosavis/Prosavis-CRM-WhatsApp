export const UNSUBSCRIBE_MAILTO = 'comercial@prosavis.com';
export const DEFAULT_UNSUBSCRIBE_BASE =
  'https://djzwjaegxbhlefanmmee.supabase.co/functions/v1/email-unsubscribe';

export type ListUnsubscribe = {
  mailto: string;
  https?: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(raw: string): Uint8Array {
  const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4));
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function normalizeUnsubscribeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidUnsubscribeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(buf);
}

export async function signUnsubscribeToken(email: string, secret: string): Promise<string> {
  const normalized = normalizeUnsubscribeEmail(email);
  if (!isValidUnsubscribeEmail(normalized)) {
    throw new Error('Correo inválido para token de baja');
  }
  if (!secret.trim()) throw new Error('Falta EMAIL_UNSUBSCRIBE_SECRET');
  const payload = new TextEncoder().encode(normalized);
  const sig = await hmacSha256(secret, `v1:${normalized}`);
  return `v1.${bytesToBase64Url(payload)}.${bytesToBase64Url(sig)}`;
}

export async function verifyUnsubscribeToken(
  token: string,
  secret: string,
): Promise<string | null> {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !secret.trim()) return null;
  let email: string;
  let given: Uint8Array;
  try {
    email = normalizeUnsubscribeEmail(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    given = base64UrlToBytes(parts[2]);
  } catch {
    return null;
  }
  if (!isValidUnsubscribeEmail(email)) return null;
  const expected = await hmacSha256(secret, `v1:${email}`);
  if (!timingSafeEqual(given, expected)) return null;
  return email;
}

export function mailtoUnsubscribeHref(): string {
  return `mailto:${UNSUBSCRIBE_MAILTO}?subject=BAJA`;
}

export function unsubscribeHttpsUrl(baseUrl: string, token: string): string {
  const base = String(baseUrl || DEFAULT_UNSUBSCRIBE_BASE).trim().replace(/\/$/, '');
  return `${base}?t=${encodeURIComponent(token)}`;
}

export async function resolveListUnsubscribe(input: {
  email: string;
  secret?: string;
  baseUrl?: string;
}): Promise<ListUnsubscribe> {
  const mailto = mailtoUnsubscribeHref();
  const secret = String(input.secret || '').trim();
  if (!secret) return { mailto };
  const token = await signUnsubscribeToken(input.email, secret);
  return {
    mailto,
    https: unsubscribeHttpsUrl(input.baseUrl || DEFAULT_UNSUBSCRIBE_BASE, token),
  };
}

export function listUnsubscribeHeaderValue(unsub: ListUnsubscribe): string {
  const parts = [`<${unsub.mailto}>`];
  if (unsub.https) parts.push(`<${unsub.https}>`);
  return parts.join(', ');
}

export type UnsubscribeStore = {
  markDirectoryOptOut(email: string): Promise<number>;
  excludePendingOutreach(email: string): Promise<number>;
};

/** Solo ese correo: opt_out + pending→excluded. No toca WhatsApp ni el resto del pool. */
export async function applyEmailUnsubscribe(
  store: UnsubscribeStore,
  email: string,
): Promise<{ directory: number; outreach: number }> {
  const normalized = normalizeUnsubscribeEmail(email);
  if (!isValidUnsubscribeEmail(normalized)) {
    return { directory: 0, outreach: 0 };
  }
  const directory = await store.markDirectoryOptOut(normalized);
  const outreach = await store.excludePendingOutreach(normalized);
  return { directory, outreach };
}
