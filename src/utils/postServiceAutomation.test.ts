import { describe, expect, it } from 'vitest';
import {
  POST_SERVICE_CAMPAIGN_TYPE,
  POST_SERVICE_TEMPLATE_LANGUAGE,
  POST_SERVICE_TEMPLATE_NAME,
  applyPostServicePreferences,
  buildPostServiceMessageBody,
  buildPostServiceTemplateComponents,
  isPostServicePreferenceEnabled,
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
});
