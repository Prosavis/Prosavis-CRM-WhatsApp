import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FIREBASE_CRM_BRIDGE_URL,
  postFirebaseJson,
} from '../../supabase/functions/_shared/firebaseHttp';

const env = (name: string): string | undefined => ({
  FIREBASE_CRM_BRIDGE_SECRET: 'server-secret',
}[name]);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('postFirebaseJson', () => {
  it('posts JSON to the canonical URL with the server-side secret header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ slots: ['2026-08-06T12:00:00.000Z'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(postFirebaseJson(
      { startDate: '2026-08-06', endDate: '2026-08-12', duration: 240 },
      { env, fetchImpl },
    )).resolves.toEqual({ slots: ['2026-08-06T12:00:00.000Z'] });

    expect(fetchImpl).toHaveBeenCalledWith(
      DEFAULT_FIREBASE_CRM_BRIDGE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-crm-secret': 'server-secret',
        },
      }),
    );
  });

  it('fails closed before fetch when the secret is missing', async () => {
    const fetchImpl = vi.fn();

    await expect(postFirebaseJson({}, {
      env: () => undefined,
      fetchImpl,
    })).rejects.toThrow('Firebase CRM bridge is not configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('aborts after at most four seconds even when a larger timeout is requested', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    const request = postFirebaseJson({}, {
      env,
      fetchImpl,
      timeoutMs: 10_000,
    });
    const rejection = expect(request).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(3_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(signal?.aborted).toBe(true);
  });
});
