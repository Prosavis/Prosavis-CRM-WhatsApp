import { describe, expect, it } from 'vitest';
import {
  POST_SERVICE_CAMPAIGN_TYPE,
  POST_SERVICE_TEMPLATE_LANGUAGE,
  POST_SERVICE_TEMPLATE_NAME,
  buildPostServiceMessageBody,
  buildPostServiceTemplateComponents,
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
