export const DEFAULT_FIREBASE_CRM_BRIDGE_URL =
  'https://us-central1-prosavis.cloudfunctions.net/crmGetAvailableSlots';

const MAX_TIMEOUT_MS = 4_000;

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

function readEdgeEnvironment(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & EdgeRuntimeGlobal;
  return runtime.Deno?.env.get(name)?.trim() || undefined;
}

function resolveTimeoutMs(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return MAX_TIMEOUT_MS;
  }
  return Math.min(Math.floor(requested), MAX_TIMEOUT_MS);
}

export async function postFirebaseJson<T = unknown>(
  body: unknown,
  options: FirebaseHttpOptions = {},
): Promise<T> {
  const env = options.env ?? readEdgeEnvironment;
  const secret = env('FIREBASE_CRM_BRIDGE_SECRET');
  if (!secret) {
    throw new Error('Firebase CRM bridge is not configured');
  }
  const url =
    env('FIREBASE_CRM_BRIDGE_URL')?.trim() ||
    DEFAULT_FIREBASE_CRM_BRIDGE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTimeoutMs(options.timeoutMs),
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
    if (!response.ok) {
      throw new Error(`Firebase CRM bridge request failed (${response.status})`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}
