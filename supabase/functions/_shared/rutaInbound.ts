/**
 * Ruta Prosavis: on-whatsapp-webhook reenvía a Firebase (`/api/r/_inbound`) los toques a botones de
 * Ruta y las ubicaciones que llegan a la 312. Si Firebase responde `{ handled: true }`, el bot no
 * contesta ese mensaje. Cualquier error deja el comportamiento de siempre (fail open).
 * Contrato: prosavis-firebase/docs/context/ruta-prosavis.md
 */
import { BOT_PHONE_NUMBER_ID } from './whatsappLines.ts';

type JsonRecord = Record<string, unknown>;

/** Respuestas rápidas de ruta_manana, ruta_sin_senal y pedir_ubicacion_cliente. */
export const RUTA_QUICK_REPLIES = ['Ver cómo llegar', 'Mandar mi ubicación', 'Enviar ubicación'] as const;
export type RutaQuickReply = (typeof RUTA_QUICK_REPLIES)[number];

export const RUTA_INBOUND_TIMEOUT_MS = 2500;

export interface RutaInboundEvent {
  from: string;
  waMessageId: string;
  type: 'button' | 'location';
  text?: RutaQuickReply;
  location?: { lat: number; lng: number };
  receivedAt: string;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function comparable(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('es');
}

export function matchRutaQuickReply(...candidates: string[]): RutaQuickReply | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = comparable(candidate);
    const match = RUTA_QUICK_REPLIES.find((label) => comparable(label) === key);
    if (match) return match;
  }
  return null;
}

function finiteInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Decide si un mensaje entrante es de Ruta. Solo la línea 312 y solo remitentes con teléfono
 * (un LID/BSUID sin número no se puede cruzar con la auxiliar ni con el cliente).
 */
export function buildRutaInboundEvent(input: {
  message: JsonRecord;
  phoneNumberId: string | null;
  receivedAt: string;
}): RutaInboundEvent | null {
  if ((input.phoneNumberId ?? '').trim() !== BOT_PHONE_NUMBER_ID) return null;

  const rawFrom = getString(input.message.from);
  if (!/^\+?\d{10,15}$/.test(rawFrom)) return null;
  const from = rawFrom.replace(/\D/g, '');
  const waMessageId = getString(input.message.id);
  if (!waMessageId) return null;

  const base = { from, waMessageId, receivedAt: input.receivedAt };
  const type = getString(input.message.type);

  if (type === 'button') {
    const button = asRecord(input.message.button);
    const text = matchRutaQuickReply(getString(button.text), getString(button.payload));
    return text ? { ...base, type: 'button', text } : null;
  }

  if (type === 'interactive') {
    const interactive = asRecord(input.message.interactive);
    if (getString(interactive.type) !== 'button_reply') return null;
    const reply = asRecord(interactive.button_reply);
    const text = matchRutaQuickReply(getString(reply.title), getString(reply.id));
    return text ? { ...base, type: 'button', text } : null;
  }

  if (type === 'location') {
    const location = asRecord(input.message.location);
    const lat = finiteInRange(location.latitude, -90, 90);
    const lng = finiteInRange(location.longitude, -180, 180);
    if (lat === null || lng === null) return null;
    return { ...base, type: 'location', location: { lat, lng } };
  }

  return null;
}

export interface RutaInboundEnv {
  url?: string;
  apiKey?: string;
}

export function buildRutaInboundRequest(
  event: RutaInboundEvent,
  env: RutaInboundEnv,
): { url: string; init: RequestInit } | null {
  const url = (env.url ?? '').trim();
  const apiKey = (env.apiKey ?? '').trim();
  if (!url || !apiKey) return null;
  return {
    url,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(event),
    },
  };
}

/** `true` solo si Firebase respondió `{ handled: true }`. Nunca lanza. */
export async function forwardRutaInbound(
  event: RutaInboundEvent,
  env: RutaInboundEnv & { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<boolean> {
  const request = buildRutaInboundRequest(event, env);
  if (!request) {
    console.warn('[ruta-inbound] RUTA_INBOUND_URL o RUTA_INBOUND_API_KEY sin configurar; sigue el bot.');
    return false;
  }
  const fetchImpl = env.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.timeoutMs ?? RUTA_INBOUND_TIMEOUT_MS);
  try {
    const response = await fetchImpl(request.url, { ...request.init, signal: controller.signal });
    const payload = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      console.warn('[ruta-inbound] Firebase respondió', response.status, { waMessageId: event.waMessageId });
      return false;
    }
    return payload.handled === true;
  } catch (error) {
    console.warn('[ruta-inbound] reenvío falló; sigue el bot', {
      waMessageId: event.waMessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
