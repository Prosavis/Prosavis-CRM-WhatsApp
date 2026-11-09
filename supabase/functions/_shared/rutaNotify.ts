/**
 * Ruta Prosavis → WhatsApp (línea 312). Firebase decide qué mandar; esta Edge solo valida y envía.
 * Contrato: prosavis-firebase/docs/context/ruta-prosavis.md
 */
import { normalizePhone } from './whatsappIdentity.ts';
import type { OutboundLocation, SendToMetaParams } from './whatsappOutbound.ts';

export const RUTA_TEMPLATE_LANGUAGE = 'es_CO';

interface RutaTemplateSpec {
  body: string;
  bodyParams: number;
  urlSuffix: boolean;
}

/**
 * Cuerpos de Ruta enviados a Meta el 06-nov-2026.
 * aux_sin_inicio_15, aux_sin_inicio_30 y alerta_sin_inicio siguen el copy aprobado;
 * se crean en Meta cuando Nicolás lo confirme. Si cambian en Meta, cambian aquí.
 */
export const RUTA_TEMPLATES = {
  ruta_hoy: {
    body: 'Hola {{1}}, hoy a las {{2}} tiene servicio. Cuando salga de su casa, toque EMPEZAR.',
    bodyParams: 2,
    urlSuffix: true,
  },
  ruta_manana: {
    body: 'Hola {{1}}, mañana a las {{2}} tiene servicio. Toque el botón para ver cómo llegar.',
    bodyParams: 2,
    urlSuffix: false,
  },
  ruta_sin_senal: {
    body: 'Hola {{1}}, no vemos dónde va. Toque el botón para mandar su ubicación.',
    bodyParams: 1,
    urlSuffix: false,
  },
  pedir_ubicacion_cliente: {
    body: 'Hola {{1}}, para que su auxiliar llegue sin perderse, ¿nos comparte la ubicación exacta? Toque el botón.',
    bodyParams: 1,
    urlSuffix: false,
  },
  alerta_llegada: {
    body: 'Alerta de llegada: {{1}} · {{2}}. Servicio de las {{3}}. Abra Llegadas de hoy.',
    bodyParams: 3,
    urlSuffix: true,
  },
  aux_sin_inicio_15: {
    body: 'Hola {{1}}, su servicio de hoy era a las {{2}} y en la app aún no aparece que haya salido ni iniciado. Márquelo apenas pueda. Si tiene un inconveniente, avísenos por aquí.',
    bodyParams: 2,
    urlSuffix: false,
  },
  aux_sin_inicio_30: {
    body: 'Hola {{1}}, ya pasaron 30 minutos de su servicio de las {{2}} y no ha marcado salida ni inicio. Es importante: márquelo ahora o comuníquese con la oficina.',
    bodyParams: 2,
    urlSuffix: false,
  },
  alerta_sin_inicio: {
    body: 'Alerta: {{1}} no ha marcado salida ni inicio del servicio de las {{2}} con {{3}}. Llámela.',
    bodyParams: 3,
    urlSuffix: false,
  },
} as const satisfies Record<string, RutaTemplateSpec>;

export type RutaTemplateName = keyof typeof RUTA_TEMPLATES;

export type RutaNotifyRequest =
  | {
    kind: 'template';
    to: string;
    templateName: RutaTemplateName;
    bodyParams: string[];
    urlSuffix?: string;
  }
  | { kind: 'location'; to: string; lat: number; lng: number; name?: string }
  | { kind: 'image'; to: string; link: string; caption?: string }
  | { kind: 'location_request'; to: string; text: string };

export type RutaNotifyKind = RutaNotifyRequest['kind'];

export type RutaNotifyParseResult =
  | { ok: true; value: RutaNotifyRequest }
  | { ok: false; error: string };

/** Lo que la Edge le pasa a `sendToMeta` (sin credenciales) y lo que guarda en el inbox. */
export interface RutaNotifyPlan {
  to: string;
  send: Omit<SendToMetaParams, 'to' | 'phoneNumberId' | 'accessToken'>;
  displayBody: string;
  templateName: RutaTemplateName | null;
  /** Mensajes de servicio: Meta los rechaza fuera de la ventana de 24 h. */
  requiresSessionWindow: boolean;
  logFields: Record<string, unknown>;
}

const MAX_PARAM_CHARS = 1024;
const MAX_TEXT_CHARS = 1024;
const MAX_NAME_CHARS = 256;
const MAX_LINK_CHARS = 2048;
const URL_SUFFIX_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/;

const ALLOWED_KEYS: Record<RutaNotifyKind, readonly string[]> = {
  template: ['kind', 'to', 'templateName', 'bodyParams', 'urlSuffix'],
  location: ['kind', 'to', 'lat', 'lng', 'name'],
  image: ['kind', 'to', 'link', 'caption'],
  location_request: ['kind', 'to', 'text'],
};

const encoder = new TextEncoder();

/** Compara la API key en tiempo constante (digest SHA-256 de ambos lados, sin filtrar el largo). */
export async function apiKeyMatches(provided: string | null | undefined, expected: string): Promise<boolean> {
  const given = (provided ?? '').trim();
  if (!given || !expected) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

export type RutaNotifyAuth = 'ok' | 'missing_env' | 'unauthorized';

export async function authorizeRutaNotify(
  apiKeyHeader: string | null,
  configuredKey: string | null | undefined,
): Promise<RutaNotifyAuth> {
  const expected = (configuredKey ?? '').trim();
  if (!expected) return 'missing_env';
  return await apiKeyMatches(apiKeyHeader, expected) ? 'ok' : 'unauthorized';
}

export function rutaNotifyAuthStatus(auth: RutaNotifyAuth): number {
  switch (auth) {
    case 'ok':
      return 200;
    case 'missing_env':
      return 500;
    case 'unauthorized':
      return 401;
    default: {
      const unreachable: never = auth;
      return unreachable;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRutaTemplateName(value: unknown): value is RutaTemplateName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RUTA_TEMPLATES, value);
}

function isRutaNotifyKind(value: unknown): value is RutaNotifyKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ALLOWED_KEYS, value);
}

/** Teléfono en dígitos con indicativo (10 dígitos que empiezan en 3 → +57). */
export function rutaRecipientPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return null;
  const phone = normalizePhone(trimmed);
  return /^\d{10,15}$/.test(phone) ? phone : null;
}

function optionalText(value: unknown, field: string, max: number): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: `${field} debe ser texto no vacío.` };
  if (value.length > max) return { ok: false, error: `${field} supera ${max} caracteres.` };
  return { ok: true, value: value.trim() };
}

function templateParamError(value: unknown, index: number): string | null {
  const field = `bodyParams[${index}]`;
  if (typeof value !== 'string' || !value.trim()) return `${field} debe ser texto no vacío.`;
  if (value.length > MAX_PARAM_CHARS) return `${field} supera ${MAX_PARAM_CHARS} caracteres.`;
  // Meta rechaza parámetros con saltos de línea, tabs o más de 4 espacios seguidos (132018).
  if (/[\n\r\t]/.test(value) || / {5,}/.test(value)) {
    return `${field} no puede tener saltos de línea, tabs ni más de 4 espacios seguidos.`;
  }
  return null;
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isHttpsLink(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_LINK_CHARS) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function parseRutaNotifyRequest(body: unknown): RutaNotifyParseResult {
  if (!isRecord(body)) return { ok: false, error: 'El cuerpo debe ser un objeto JSON.' };
  const kind = body.kind;
  if (!isRutaNotifyKind(kind)) {
    return { ok: false, error: 'kind debe ser template, location, image o location_request.' };
  }

  const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_KEYS[kind].includes(key));
  if (unknownKeys.length) {
    return { ok: false, error: `Campos no permitidos para ${kind}: ${unknownKeys.join(', ')}.` };
  }

  const to = rutaRecipientPhone(body.to);
  if (!to) return { ok: false, error: 'to debe ser un teléfono con indicativo (10 a 15 dígitos).' };

  switch (kind) {
    case 'template': {
      const templateName = body.templateName;
      if (!isRutaTemplateName(templateName)) {
        return { ok: false, error: `templateName debe ser uno de: ${Object.keys(RUTA_TEMPLATES).join(', ')}.` };
      }
      const spec = RUTA_TEMPLATES[templateName];
      if (!Array.isArray(body.bodyParams)) return { ok: false, error: 'bodyParams debe ser una lista de textos.' };
      if (body.bodyParams.length !== spec.bodyParams) {
        return { ok: false, error: `${templateName} lleva ${spec.bodyParams} parámetro(s) en bodyParams.` };
      }
      for (const [index, value] of body.bodyParams.entries()) {
        const error = templateParamError(value, index);
        if (error) return { ok: false, error };
      }
      const urlSuffix = body.urlSuffix;
      if (spec.urlSuffix) {
        if (typeof urlSuffix !== 'string' || !URL_SUFFIX_PATTERN.test(urlSuffix)) {
          return { ok: false, error: `${templateName} requiere urlSuffix (letras, números, . _ ~ -; máx. 256).` };
        }
      } else if (urlSuffix !== undefined) {
        return { ok: false, error: `${templateName} no tiene botón URL; quite urlSuffix.` };
      }
      return {
        ok: true,
        value: {
          kind,
          to,
          templateName,
          bodyParams: (body.bodyParams as string[]).map((value) => value.trim()),
          ...(spec.urlSuffix ? { urlSuffix: urlSuffix as string } : {}),
        },
      };
    }
    case 'location': {
      if (!isFiniteInRange(body.lat, -90, 90)) return { ok: false, error: 'lat debe ser un número entre -90 y 90.' };
      if (!isFiniteInRange(body.lng, -180, 180)) return { ok: false, error: 'lng debe ser un número entre -180 y 180.' };
      const name = optionalText(body.name, 'name', MAX_NAME_CHARS);
      if (!name.ok) return name;
      return {
        ok: true,
        value: { kind, to, lat: body.lat, lng: body.lng, ...(name.value ? { name: name.value } : {}) },
      };
    }
    case 'image': {
      if (!isHttpsLink(body.link)) return { ok: false, error: 'link debe ser una URL https.' };
      const caption = optionalText(body.caption, 'caption', MAX_TEXT_CHARS);
      if (!caption.ok) return caption;
      return {
        ok: true,
        value: { kind, to, link: body.link.trim(), ...(caption.value ? { caption: caption.value } : {}) },
      };
    }
    case 'location_request': {
      const text = optionalText(body.text, 'text', MAX_TEXT_CHARS);
      if (!text.ok) return text;
      if (!text.value) return { ok: false, error: 'text es obligatorio.' };
      return { ok: true, value: { kind, to, text: text.value } };
    }
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function renderRutaTemplateBody(templateName: RutaTemplateName, bodyParams: readonly string[]): string {
  return RUTA_TEMPLATES[templateName].body.replace(
    /\{\{(\d+)\}\}/g,
    (match, index: string) => bodyParams[Number(index) - 1] ?? match,
  );
}

export function buildRutaNotifyPayload(request: RutaNotifyRequest): RutaNotifyPlan {
  switch (request.kind) {
    case 'template': {
      const components: Array<Record<string, unknown>> = [
        {
          type: 'body',
          parameters: request.bodyParams.map((text) => ({ type: 'text', text })),
        },
      ];
      if (request.urlSuffix) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: request.urlSuffix }],
        });
      }
      // El sufijo de ruta_hoy es el token del trayecto: no se guarda en el inbox.
      const displayBody = renderRutaTemplateBody(request.templateName, request.bodyParams);
      return {
        to: request.to,
        send: {
          templateName: request.templateName,
          templateLanguage: RUTA_TEMPLATE_LANGUAGE,
          templateComponents: components,
          messageBody: displayBody,
          requirePhone: true,
        },
        displayBody,
        templateName: request.templateName,
        requiresSessionWindow: false,
        logFields: { template_name: request.templateName },
      };
    }
    case 'location': {
      const location: OutboundLocation = {
        latitude: request.lat,
        longitude: request.lng,
        ...(request.name ? { name: request.name } : {}),
      };
      const displayBody = request.name ?? '[ubicación]';
      return {
        to: request.to,
        send: { location, messageBody: displayBody, requirePhone: true },
        displayBody,
        templateName: null,
        requiresSessionWindow: true,
        logFields: { location },
      };
    }
    case 'image': {
      const displayBody = request.caption ?? '[image]';
      return {
        to: request.to,
        send: {
          mediaType: 'image',
          mediaUrl: request.link,
          ...(request.caption ? { caption: request.caption } : {}),
          requirePhone: true,
        },
        displayBody,
        templateName: null,
        requiresSessionWindow: true,
        logFields: {
          media_type: 'image',
          media_url: request.link,
          caption: request.caption ?? null,
        },
      };
    }
    case 'location_request':
      return {
        to: request.to,
        send: { locationRequest: true, messageBody: request.text, requirePhone: true },
        displayBody: request.text,
        templateName: null,
        requiresSessionWindow: true,
        logFields: {},
      };
    default: {
      const unreachable: never = request;
      return unreachable;
    }
  }
}
