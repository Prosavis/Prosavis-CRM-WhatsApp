import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FIREBASE_CRM_APPOINTMENT_ACTIONS_URL,
  DEFAULT_FIREBASE_CRM_BRIDGE_URL,
  FirebaseCrmBridgeHttpError,
  postCrmAppointmentAction,
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

describe('postCrmAppointmentAction', () => {
  it('posts to crmAppointmentActions with the CRM secret header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ appointmentId: 'appt-1' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(postCrmAppointmentAction(
      {
        operationId: '123e4567-e89b-42d3-a456-426614174000',
        crmAdminId: 'admin-1',
        type: 'create_appointment',
        directoryId: 'dir-1',
        scheduledDate: '2026-08-10T14:00:00.000Z',
        duration: 240,
        wantsKit: false,
      },
      { env, fetchImpl },
    )).resolves.toEqual({ appointmentId: 'appt-1' });

    expect(fetchImpl).toHaveBeenCalledWith(
      DEFAULT_FIREBASE_CRM_APPOINTMENT_ACTIONS_URL,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-crm-secret': 'server-secret',
        },
      }),
    );
  });

  it('propagates non-OK status and JSON body without leaking the secret', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'conflict', code: 'ALREADY_EXISTS' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    ));

    try {
      await postCrmAppointmentAction({}, { env, fetchImpl });
      throw new Error('expected postCrmAppointmentAction to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(FirebaseCrmBridgeHttpError);
      expect(error).toMatchObject({
        status: 409,
        body: { error: 'conflict', code: 'ALREADY_EXISTS' },
      });
      expect(String(error)).not.toMatch(/server-secret/);
    }
  });

  it('caps appointment timeout at eight seconds', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    const request = postCrmAppointmentAction({}, {
      env,
      fetchImpl,
      timeoutMs: 20_000,
    });
    const rejection = expect(request).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(7_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(signal?.aborted).toBe(true);
  });
});
