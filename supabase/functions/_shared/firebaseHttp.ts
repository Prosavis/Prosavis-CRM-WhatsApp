export const DEFAULT_FIREBASE_CRM_BRIDGE_URL =
  'https://us-central1-prosavis.cloudfunctions.net/crmGetAvailableSlots';

export const DEFAULT_FIREBASE_CRM_APPOINTMENT_ACTIONS_URL =
  'https://us-central1-prosavis.cloudfunctions.net/crmAppointmentActions';

const SLOT_MAX_TIMEOUT_MS = 4_000;
const APPOINTMENT_MAX_TIMEOUT_MS = 8_000;

type EnvReader = (name: string) => string | undefined;
type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface EdgeRuntimeGlobal {
  Deno?: {
    env: {
      get(name: string): string | undefined;
    };
  };
}

export interface FirebaseHttpOptions {
  env?: EnvReader;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export class FirebaseCrmBridgeHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Firebase CRM bridge request failed (${status})`);
    this.name = 'FirebaseCrmBridgeHttpError';
    this.status = status;
    this.body = body;
  }
}

function readEdgeEnvironment(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & EdgeRuntimeGlobal;
  return runtime.Deno?.env.get(name)?.trim() || undefined;
}

function resolveTimeoutMs(
  requested: number | undefined,
  maxTimeoutMs: number,
): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return maxTimeoutMs;
  }
  return Math.min(Math.floor(requested), maxTimeoutMs);
}

function requireBridgeSecret(env: EnvReader): string {
  const secret = env('FIREBASE_CRM_BRIDGE_SECRET');
  if (!secret) {
    throw new Error('Firebase CRM bridge is not configured');
  }
  return secret;
}

async function postFirebaseBridgeJson<T>(
  url: string,
  body: unknown,
  options: FirebaseHttpOptions,
  maxTimeoutMs: number,
  propagateHttpError: boolean,
): Promise<T> {
  const env = options.env ?? readEdgeEnvironment;
  const secret = requireBridgeSecret(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTimeoutMs(options.timeoutMs, maxTimeoutMs),
  );

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crm-secret': secret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const rawText = await response.text();
    let parsed: unknown = rawText;
    if (rawText && contentType.includes('application/json')) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = rawText;
      }
    } else if (!rawText) {
      parsed = null;
    }

    if (!response.ok) {
      if (propagateHttpError) {
        throw new FirebaseCrmBridgeHttpError(response.status, parsed);
      }
      throw new Error(`Firebase CRM bridge request failed (${response.status})`);
    }

    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function postFirebaseJson<T = unknown>(
  body: unknown,
  options: FirebaseHttpOptions = {},
): Promise<T> {
  const env = options.env ?? readEdgeEnvironment;
  const url =
    env('FIREBASE_CRM_BRIDGE_URL')?.trim() ||
    DEFAULT_FIREBASE_CRM_BRIDGE_URL;
  return postFirebaseBridgeJson<T>(
    url,
    body,
    options,
    SLOT_MAX_TIMEOUT_MS,
    false,
  );
}

export async function postCrmAppointmentAction<T = unknown>(
  body: unknown,
  options: FirebaseHttpOptions = {},
): Promise<T> {
  const env = options.env ?? readEdgeEnvironment;
  const url =
    env('FIREBASE_CRM_APPOINTMENT_ACTIONS_URL')?.trim() ||
    DEFAULT_FIREBASE_CRM_APPOINTMENT_ACTIONS_URL;
  return postFirebaseBridgeJson<T>(
    url,
    body,
    options,
    APPOINTMENT_MAX_TIMEOUT_MS,
    true,
  );
}
