import { describe, expect, it } from 'vitest';
import {
  POST_SERVICE_CAMPAIGN_TYPE,
  POST_SERVICE_TEMPLATE_LANGUAGE,
  POST_SERVICE_TEMPLATE_NAME,
  applyPostServicePreferences,
  buildPostServiceMessageBody,
  buildPostServiceTemplateComponents,
  formatPostServiceServiceDate,
  groupPostServiceContacts,
  isPostServiceQueueOutcome,
  isPostServiceSettledOutcome,
  isPostServicePreferenceEnabled,
  mergePostServiceDashboardEvents,
  resolvePostServiceDirectoryId,
  resolvePostServiceRecurringSkip,
} from '../../supabase/functions/_shared/postServiceAutomation';

describe('post-service WhatsApp automation', () => {
  it('keeps the approved template identifiers and exact message copy', () => {
    expect(POST_SERVICE_TEMPLATE_NAME).toBe('service_finalizado');
    expect(POST_SERVICE_TEMPLATE_LANGUAGE).toBe('es_CO');
    expect(POST_SERVICE_CAMPAIGN_TYPE).toBe('POST_SERVICIO');
    expect(buildPostServiceMessageBody('María', '22 de julio de 2026')).toBe(
      'Hola María, tu servicio de limpieza del 22 de julio de 2026 ha finalizado. Gracias por confiar en Prosavis.\n\n¿Cómo te fue? Cuéntanos por este chat. Si quieres reagendar, responde con el día que necesitas y revisamos disponibilidad.',
    );
  });

  it('builds the approved positional template components for name and date', () => {
    expect(
      buildPostServiceTemplateComponents('María', '22 de julio de 2026'),
    ).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'María' },
          {
            type: 'text',
            text: '22 de julio de 2026',
          },
        ],
      },
    ]);
  });

  it('skips recurring clients tagged in classification or tags', () => {
    expect(
      resolvePostServiceRecurringSkip({
        classification: 'Cliente recurrente',
        tags: [],
        isRecurringSeries: false,
        hasFutureBooking: false,
      }),
    ).toBe('skipped_recurring');
    expect(
      resolvePostServiceRecurringSkip({
        classification: null,
        tags: ['recurrente'],
        isRecurringSeries: false,
        hasFutureBooking: false,
      }),
    ).toBe('skipped_recurring');
  });

  it('skips completed appointments that belong to a recurring series', () => {
    expect(
      resolvePostServiceRecurringSkip({
        classification: null,
        tags: [],
        isRecurringSeries: true,
        hasFutureBooking: false,
      }),
    ).toBe('skipped_recurring');
  });

  it('skips one-shot clients that already have a future booking', () => {
    expect(
      resolvePostServiceRecurringSkip({
        classification: null,
        tags: [],
        isRecurringSeries: false,
        hasFutureBooking: true,
      }),
    ).toBe('skipped_has_future_booking');
  });

  it('does not skip a one-shot client without a future booking', () => {
    expect(
      resolvePostServiceRecurringSkip({
        classification: 'one-shot',
        tags: ['nuevo'],
        isRecurringSeries: false,
        hasFutureBooking: false,
      }),
    ).toBeNull();
  });

  it('prefers recurring over future-booking when both apply', () => {
    expect(
      resolvePostServiceRecurringSkip({
        classification: null,
        tags: ['cliente recurrente'],
        isRecurringSeries: false,
        hasFutureBooking: true,
      }),
    ).toBe('skipped_recurring');
  });
});

describe('post-service recipient preference toggle', () => {
  it('keeps the switch off after a sent event if the contact preference is disabled', () => {
    expect(
      isPostServicePreferenceEnabled({
        outcome: 'sent',
        postServiceEnabled: false,
      }),
    ).toBe(false);
  });

  it('does not treat a pending or failed event as disabled just because it was not skipped_disabled', () => {
    expect(
      isPostServicePreferenceEnabled({
        outcome: 'pending',
        postServiceEnabled: true,
      }),
    ).toBe(true);
    expect(
      isPostServicePreferenceEnabled({
        outcome: 'failed',
        postServiceEnabled: true,
      }),
    ).toBe(true);
  });

  it('applies stored preferences by directory id, defaulting missing rows to enabled', () => {
    const enabledByDirectoryId = new Map<string, boolean>([
      ['dir-off', false],
      ['dir-on', true],
    ]);
    const [disabled, enabled, unknown] = applyPostServicePreferences(
      [
        { directory_id: 'dir-off', outcome: 'sent' },
        { directory_id: 'dir-on', outcome: 'pending' },
        { directory_id: 'dir-new', outcome: 'scheduled' },
      ],
      enabledByDirectoryId,
    );
    expect(disabled.postServiceEnabled).toBe(false);
    expect(enabled.postServiceEnabled).toBe(true);
    expect(unknown.postServiceEnabled).toBe(true);
  });

  it('resolves directory id from appointment clientId lookup maps', () => {
    expect(
      resolvePostServiceDirectoryId(
        {
          appointmentId: 'appt-1',
          clientId: 'firebase-uid',
          clientAppUserId: null,
        },
        {
          byId: new Map(),
          byAppUserId: new Map([['firebase-uid', 'dir-123']]),
          byAppointmentId: new Map(),
          byPhoneKey: new Map(),
          byFirestoreDocId: new Map(),
        },
      ),
    ).toBe('dir-123');
  });

  it('resolves directory id from the Firebase crmClients document id', () => {
    expect(
      resolvePostServiceDirectoryId(
        {
          appointmentId: 'appt-2',
          clientId: 'crmClientDoc',
          clientAppUserId: null,
        },
        {
          byId: new Map(),
          byAppUserId: new Map(),
          byAppointmentId: new Map(),
          byPhoneKey: new Map(),
          byFirestoreDocId: new Map([['crmClientDoc', 'dir-firebase']]),
        },
      ),
    ).toBe('dir-firebase');
  });

  it('resolves directory id from the appointment phone when clientId is not in directory', () => {
    expect(
      resolvePostServiceDirectoryId(
        {
          appointmentId: 'appt-phone',
          clientId: 'firestore-client-xyz',
          clientAppUserId: null,
          recipientPhone: '+573017481288',
        },
        {
          byId: new Map(),
          byAppUserId: new Map(),
          byAppointmentId: new Map(),
          byPhoneKey: new Map([['3017481288', 'dir-ana']]),
          byFirestoreDocId: new Map(),
        },
      ),
    ).toBe('dir-ana');
  });
});

describe('post-service dashboard merge and operation rows', () => {
  it('prefers a persisted skip/sent event over a synthetic Firestore pending row', () => {
    const merged = mergePostServiceDashboardEvents(
      [
        {
          id: 'firestore:VvGbkjB2',
          appointment_id: 'VvGbkjB2wJH5ZaOiHZsJ',
          directory_id: null,
          recipient_phone: '+573017481288',
          recipient_name: 'Ana Maria Sierra G',
          outcome: 'pending',
          created_at: '2026-09-16T13:00:00.000Z',
        },
      ],
      [
        {
          id: 'event-skip',
          appointment_id: 'VvGbkjB2wJH5ZaOiHZsJ',
          directory_id: 'dir-ana',
          recipient_phone: '573017481288',
          recipient_name: 'Ana Maria Sierra G',
          outcome: 'skipped_disabled',
          created_at: '2026-09-08T23:00:11.000Z',
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].outcome).toBe('skipped_disabled');
    expect(merged[0].directory_id).toBe('dir-ana');
  });

  it('keeps a Firestore pending row when that appointment has no persisted event', () => {
    const merged = mergePostServiceDashboardEvents(
      [
        {
          id: 'firestore:new',
          appointment_id: 'new-appt',
          directory_id: 'dir-new',
          outcome: 'pending',
          created_at: '2026-09-16T12:00:00.000Z',
        },
      ],
      [
        {
          id: 'event-other',
          appointment_id: 'other-appt',
          directory_id: 'dir-other',
          outcome: 'sent',
          created_at: '2026-09-16T11:00:00.000Z',
        },
      ],
    );

    expect(merged.map((event) => event.id)).toEqual(['firestore:new', 'event-other']);
  });

  it('groups operation rows by contact so the toggle is per client, not per historical event', () => {
    const rows = groupPostServiceContacts([
      {
        id: 'pending-new',
        appointment_id: 'appt-2',
        directory_id: 'dir-ana',
        recipient_phone: '+573017481288',
        recipient_name: 'Ana Maria Sierra G',
        outcome: 'pending',
        created_at: '2026-09-16T13:00:00.000Z',
      },
      {
        id: 'skipped-old',
        appointment_id: 'appt-1',
        directory_id: 'dir-ana',
        recipient_phone: '573017481288',
        recipient_name: 'Ana Maria Sierra G',
        outcome: 'skipped_disabled',
        created_at: '2026-09-08T23:00:00.000Z',
      },
      {
        id: 'sent-other',
        appointment_id: 'appt-sofia',
        directory_id: 'dir-sofia',
        recipient_phone: '+573150729571',
        recipient_name: 'Ana Sofia Gomez',
        outcome: 'sent',
        created_at: '2026-09-16T13:41:00.000Z',
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].directory_id).toBe('dir-sofia');
    expect(rows[1].directory_id).toBe('dir-ana');
    expect(rows[1].outcome).toBe('pending');
  });

  it('collapses the same phone into one client even if one row lacks directory_id', () => {
    const rows = groupPostServiceContacts([
      {
        id: 'pending',
        appointment_id: 'a1',
        directory_id: null,
        recipient_phone: '+573017481288',
        recipient_name: 'Ana Maria Sierra G',
        outcome: 'pending',
        created_at: '2026-09-16T13:00:00.000Z',
        postServiceEnabled: true,
      },
      {
        id: 'skipped',
        appointment_id: 'a0',
        directory_id: 'dir-ana',
        recipient_phone: '573017481288',
        recipient_name: 'Ana Maria Sierra G',
        outcome: 'skipped_disabled',
        created_at: '2026-09-08T23:00:00.000Z',
        postServiceEnabled: false,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].directory_id).toBe('dir-ana');
    expect(rows[0].outcome).toBe('pending');
    expect(rows[0].id).toBe('pending');
    expect(rows[0].postServiceEnabled).toBe(false);
  });

  it('treats sent and skipped outcomes as settled, and pending/failed as queue', () => {
    expect(isPostServiceSettledOutcome('sent')).toBe(true);
    expect(isPostServiceSettledOutcome('skipped_disabled')).toBe(true);
    expect(isPostServiceSettledOutcome('pending')).toBe(false);
    expect(isPostServiceQueueOutcome('pending')).toBe(true);
    expect(isPostServiceQueueOutcome('failed')).toBe(true);
    expect(isPostServiceQueueOutcome('sent')).toBe(false);
  });

  it('displays locale service dates instead of Invalid Date', () => {
    expect(formatPostServiceServiceDate('15 de septiembre de 2026')).toBe(
      '15 de septiembre de 2026',
    );
    expect(formatPostServiceServiceDate('2026-09-15T18:00:00.000Z')).toMatch(/15/);
    expect(formatPostServiceServiceDate('')).toBe('—');
  });
});
