import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INBOX_AI_SUGGESTION_JSON_SCHEMA,
  generateInboxAiSuggestion,
  normalizeInboxAiSuggestionOutput,
} from '../../supabase/functions/_shared/inboxAiActions';
import type { NormalizedBookingContext } from '../../supabase/functions/_shared/bookingContext';

const slot = '2026-08-10T14:00:00.000Z';

const bookingContext: NormalizedBookingContext = {
  stage: 'summary_confirmation',
  collectedData: {
    date: '2026-08-10',
    time: '09:00',
    duration: 240,
    address: 'Calle 123 # 45-67',
    addressSource: 'conversation',
  },
  missingData: [],
  availableSlots: [slot],
  paymentStatus: 'PENDING',
  paymentAmount: 88_000,
  wantsKit: false,
  calculatedPrice: 88_000,
  clientInfo: {
    name: 'Ana',
    phone: '+573001112233',
    email: null,
    address: 'Calle 123 # 45-67',
    city: 'Bogotá',
    isReturningClient: true,
    userId: 'user-1',
  },
};

const grounding = {
  bookingContext,
  appointments: [{ id: 'appointment-real' }],
  wompiCheckoutUrl: 'https://checkout.wompi.co/l/grounded',
  wompiAmountCOP: 88_000,
  wompiPaymentReference: 'grounded-reference',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeInboxAiSuggestionOutput', () => {
  it('cleans text, limits actions to five and owns confirmation metadata', () => {
    const proposedActions = Array.from({ length: 6 }, (_, index) => ({
      id: `gemini-${index}`,
      type: 'apply_tag',
      label: `  Etiqueta   ${index}  `,
      reason: `  Razón   ${index}  `,
      requiresConfirmation: false,
      payload: { tagName: ` Interés ${index} ` },
    }));

    const result = normalizeInboxAiSuggestionOutput({
      suggestion: '  Respuesta lista  ',
      proposedActions,
    }, grounding);

    expect(result.suggestion).toBe('Respuesta lista');
    expect(result.proposedActions).toHaveLength(5);
    expect(result.proposedActions[0]).toMatchObject({
      type: 'apply_tag',
      label: 'Etiqueta 0',
      reason: 'Razón 0',
      requiresConfirmation: true,
      payload: { tagName: 'Interés 0' },
    });
    expect(result.proposedActions.every((action) =>
      action.id.length > 0 && !action.id.startsWith('gemini-')
    )).toBe(true);
  });

  it('builds payment payloads exclusively from grounded checkout data', () => {
    const result = normalizeInboxAiSuggestionOutput({
      suggestion: 'Paga aquí',
      proposedActions: [{
        type: 'send_payment_link',
        label: 'Enviar enlace',
        reason: 'El cliente confirmó',
        payload: {
          url: 'https://attacker.invalid/invented',
          amountCOP: 1,
          reference: 'invented-reference',
        },
      }],
    }, grounding);

    expect(result.proposedActions[0]).toMatchObject({
      type: 'send_payment_link',
      payload: {
        url: grounding.wompiCheckoutUrl,
        amountCOP: grounding.wompiAmountCOP,
        reference: grounding.wompiPaymentReference,
      },
    });

    const withoutGroundedPayment = normalizeInboxAiSuggestionOutput({
      suggestion: 'Paga aquí',
      proposedActions: [{
        type: 'send_payment_link',
        label: 'Enviar enlace',
        reason: 'El cliente confirmó',
        payload: {
          url: 'https://attacker.invalid/invented',
          amountCOP: 1,
        },
      }],
    }, {
      ...grounding,
      wompiCheckoutUrl: undefined,
      wompiAmountCOP: undefined,
    });

    expect(withoutGroundedPayment.proposedActions).toEqual([]);
  });

  it('grounds creation and rescheduling against real slots and appointments', () => {
    const result = normalizeInboxAiSuggestionOutput({
      suggestion: 'Organicemos tu servicio',
      proposedActions: [
        {
          type: 'create_appointment',
          label: 'Crear cita',
          reason: 'El cliente confirmó',
          payload: {
            scheduledDate: slot,
            duration: 120,
            address: 'Dirección inventada',
            wantsKit: true,
          },
        },
        {
          type: 'create_appointment',
          label: 'Crear cita falsa',
          reason: 'Slot inventado',
          payload: {
            scheduledDate: '2099-01-01T00:00:00.000Z',
            duration: 240,
            address: 'Dirección inventada',
            wantsKit: true,
          },
        },
        {
          type: 'reschedule_appointment',
          label: 'Reagendar',
          reason: 'El cliente pidió otro horario',
          payload: {
            appointmentId: 'appointment-real',
            scheduledDate: slot,
          },
        },
        {
          type: 'reschedule_appointment',
          label: 'Reagendar cita falsa',
          reason: 'ID inventado',
          payload: {
            appointmentId: 'appointment-invented',
            scheduledDate: slot,
          },
        },
      ],
    }, grounding);

    expect(result.proposedActions).toHaveLength(2);
    expect(result.proposedActions[0]).toMatchObject({
      type: 'create_appointment',
      payload: {
        scheduledDate: slot,
        duration: 240,
        address: bookingContext.collectedData.address,
        wantsKit: false,
      },
    });
    expect(result.proposedActions[1]).toMatchObject({
      type: 'reschedule_appointment',
      payload: {
        appointmentId: 'appointment-real',
        scheduledDate: slot,
      },
    });
  });

  it('normalizes safe tag and template payloads while discarding invalid variants', () => {
    const result = normalizeInboxAiSuggestionOutput({
      suggestion: 'Acciones disponibles',
      proposedActions: [
        {
          type: 'apply_tag',
          label: 'Etiquetar',
          reason: 'Hay interés',
          payload: { tagName: ' Interesado ', tagId: 'model-owned-id' },
        },
        {
          type: 'apply_tag',
          label: 'Etiqueta duplicada',
          reason: 'Misma acción',
          payload: { tagName: 'Interesado' },
        },
        {
          type: 'send_template',
          label: ' Enviar   plantilla ',
          reason: ' Ventana   cerrada ',
          payload: {
            templateName: ' seguimiento_cliente ',
            languageCode: ' es_CO ',
            variables: {
              ' nombre ': ' Ana ',
              invalid: 123,
            },
          },
        },
        {
          type: 'send_template',
          label: 'Sin idioma',
          reason: 'Payload incompleto',
          payload: {
            templateName: 'seguimiento_cliente',
            variables: {},
          },
        },
        {
          type: 'delete_everything',
          label: 'Desconocida',
          reason: 'No soportada',
          payload: {},
        },
      ],
    }, grounding);

    expect(result.proposedActions).toHaveLength(2);
    expect(result.proposedActions[0]).toMatchObject({
      type: 'apply_tag',
      payload: { tagName: 'Interesado' },
    });
    expect(result.proposedActions[0]?.payload).not.toHaveProperty('tagId');
    expect(result.proposedActions[1]).toMatchObject({
      type: 'send_template',
      label: 'Enviar plantilla',
      reason: 'Ventana cerrada',
      payload: {
        templateName: 'seguimiento_cliente',
        languageCode: 'es_CO',
        variables: { nombre: 'Ana' },
      },
    });
  });

  it('clips model-controlled action copy to bounded lengths', () => {
    const result = normalizeInboxAiSuggestionOutput({
      suggestion: 'Acción',
      proposedActions: [{
        type: 'apply_tag',
        label: `  ${'L'.repeat(200)}  `,
        reason: `  ${'R'.repeat(800)}  `,
        payload: { tagName: 'Interesado' },
      }],
    }, grounding);

    expect(result.proposedActions[0]?.label).toHaveLength(120);
    expect(result.proposedActions[0]?.reason).toHaveLength(500);
  });

  it('discards malformed entries without suppressing later valid actions', () => {
    const result = normalizeInboxAiSuggestionOutput({
      suggestion: 'Acción',
      proposedActions: [
        null,
        {
          type: 'apply_tag',
          label: 'Etiquetar',
          reason: 'Hay interés',
          payload: { tagName: 'Interesado' },
        },
      ],
    }, grounding);

    expect(result.proposedActions).toHaveLength(1);
    expect(result.proposedActions[0]?.type).toBe('apply_tag');
  });
});

describe('generateInboxAiSuggestion', () => {
  it('uses the strict responseJsonSchema on the real Gemini HTTP request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              suggestion: 'Respuesta grounded',
              proposedActions: [],
            }),
          }],
        },
        finishReason: 'STOP',
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateInboxAiSuggestion({
      apiKey: 'test-api-key',
      contextPrompt: 'Contexto grounded de prueba',
      grounding,
    })).resolves.toEqual({
      suggestion: 'Respuesta grounded',
      proposedActions: [],
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig.responseJsonSchema).toEqual(
      INBOX_AI_SUGGESTION_JSON_SCHEMA,
    );
    expect(body.generationConfig).not.toHaveProperty('responseSchema');
    expect(INBOX_AI_SUGGESTION_JSON_SCHEMA).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['suggestion', 'proposedActions'],
      properties: {
        proposedActions: { type: 'array', maxItems: 5 },
      },
    });
    expect(body.contents[0]?.parts[0]?.text).toContain(
      'no se han ejecutado',
    );
    expect(body.contents[0]?.parts[0]?.text).toContain(
      'confirmación humana',
    );
    expect(body.contents[0]?.parts[0]?.text).toContain(
      'No inventes slots, IDs de citas, links, montos, tags ni plantillas',
    );
  });
});
