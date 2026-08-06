import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INBOX_AI_SUGGESTION_JSON_SCHEMA,
  generateInboxAiSuggestion,
  normalizeInboxAiSuggestionOutput,
} from '../../supabase/functions/_shared/inboxAiActions';
import {
  createGeneratedInboxAiSuggestionResponse,
  createLastOutboundInboxAiSuggestionResponse,
} from '../../supabase/functions/_shared/inboxAiSuggestionResponse';
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
    const ids = result.proposedActions.map((action) => action.id);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(id)
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
          payload: { tagName: ' Interés ', tagId: 'model-owned-id' },
        },
        {
          type: 'apply_tag',
          label: 'Etiqueta duplicada',
          reason: 'Misma acción',
          payload: { tagName: 'INTERÉS' },
        },
        {
          type: 'send_template',
          label: ' Enviar   plantilla ',
          reason: ' Ventana   cerrada ',
          payload: {
            templateName: ' Confirmación_Cliente ',
            languageCode: ' es_CO ',
            variables: {
              ' Nombre ': ' Ána ',
              invalid: 123,
            },
          },
        },
        {
          type: 'send_template',
          label: 'Plantilla duplicada',
          reason: 'Misma plantilla',
          payload: {
            templateName: 'CONFIRMACIÓN_CLIENTE',
            languageCode: 'ES_co',
            variables: {
              NOMBRE: 'ÁNA',
              invalid: 123,
            },
          },
        },
        {
          type: 'send_template',
          label: 'Sin idioma',
          reason: 'Payload incompleto',
          payload: {
            templateName: 'confirmación_cliente',
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
      payload: { tagName: 'Interés' },
    });
    expect(result.proposedActions[0]?.payload).not.toHaveProperty('tagId');
    expect(result.proposedActions[1]).toMatchObject({
      type: 'send_template',
      label: 'Enviar plantilla',
      reason: 'Ventana cerrada',
      payload: {
        templateName: 'Confirmación_Cliente',
        languageCode: 'es_CO',
        variables: { Nombre: 'Ána' },
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
  it('emits only JSON Schema keywords supported by Gemini structured output', () => {
    const supportedKeywords = new Set([
      'type',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'anyOf',
      'oneOf',
      'enum',
      '$id',
      '$defs',
      '$ref',
      '$anchor',
      'format',
      'title',
      'description',
      'prefixItems',
      'minItems',
      'maxItems',
      'minimum',
      'maximum',
      'propertyOrdering',
    ]);

    const visitSchema = (schema: unknown, path = '$'): void => {
      expect(schema, path).toBeTypeOf('object');
      expect(schema, path).not.toBeNull();
      expect(Array.isArray(schema), path).toBe(false);
      for (const [keyword, value] of Object.entries(
        schema as Record<string, unknown>,
      )) {
        expect(supportedKeywords.has(keyword), `${path}.${keyword}`).toBe(true);
        if (keyword === 'properties' || keyword === '$defs') {
          for (const [propertyName, propertySchema] of Object.entries(
            value as Record<string, unknown>,
          )) {
            visitSchema(propertySchema, `${path}.properties.${propertyName}`);
          }
        } else if (
          keyword === 'items' ||
          (keyword === 'additionalProperties' && typeof value === 'object')
        ) {
          visitSchema(value, `${path}.${keyword}`);
        } else if (
          keyword === 'anyOf' ||
          keyword === 'oneOf' ||
          keyword === 'prefixItems'
        ) {
          for (const [index, option] of (value as unknown[]).entries()) {
            visitSchema(option, `${path}.${keyword}[${index}]`);
          }
        }
      }
    };

    visitSchema(INBOX_AI_SUGGESTION_JSON_SCHEMA);
  });

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
      systemInstruction: 'INSTRUCCIÓN DEL INBOX',
      contextPrompt: 'Contexto grounded de prueba',
      grounding,
    })).resolves.toEqual({
      suggestion: 'Respuesta grounded',
      proposedActions: [],
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      systemInstruction?: { parts: Array<{ text: string }> };
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
    expect(body.systemInstruction?.parts[0]?.text).toContain(
      'INSTRUCCIÓN DEL INBOX',
    );
    expect(body.systemInstruction?.parts[0]?.text).toContain(
      'no se han ejecutado',
    );
    expect(body.systemInstruction?.parts[0]?.text).toContain(
      'confirmación humana',
    );
    expect(body.systemInstruction?.parts[0]?.text).toContain(
      'No inventes slots, IDs de citas, links, montos, tags ni plantillas',
    );
    expect(body.contents[0]?.parts[0]?.text).toBe(
      'Contexto grounded de prueba',
    );
    expect(body.contents[0]?.parts[0]?.text).not.toContain(
      'INSTRUCCIÓN DEL INBOX',
    );
  });
});

describe('suggest-whatsapp-agent-reply response wiring', () => {
  const responseContext = {
    historyMeta: {
      loaded: 2,
      truncated: false,
      newestAt: '2026-08-06T15:00:00.000Z',
      oldestAt: '2026-08-06T14:00:00.000Z',
    },
    conversationTags: ['Interés'],
    sessionWindow: {
      status: 'open' as const,
      lastInboundAt: '2026-08-06T15:00:00.000Z',
      expiresAt: '2026-08-07T15:00:00.000Z',
      requiresTemplate: false,
    },
  };

  it('returns no proposed actions when the last message is outbound', async () => {
    const response = createLastOutboundInboxAiSuggestionResponse(responseContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      suggestion: null,
      proposedActions: [],
      lastMessageIsOutbound: true,
      historyMeta: responseContext.historyMeta,
      conversationTags: responseContext.conversationTags,
      sessionWindow: responseContext.sessionWindow,
    });
  });

  it('returns normalized proposed actions from the generation path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              suggestion: '  Respuesta generada  ',
              proposedActions: [
                {
                  id: 'model-owned-id',
                  type: 'apply_tag',
                  label: ' Etiquetar ',
                  reason: ' Hay interés ',
                  requiresConfirmation: false,
                  payload: { tagName: ' Interés ' },
                },
                {
                  type: 'apply_tag',
                  label: 'Duplicada',
                  reason: 'Misma etiqueta',
                  payload: { tagName: 'INTERÉS' },
                },
              ],
            }),
          }],
        },
        finishReason: 'STOP',
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await createGeneratedInboxAiSuggestionResponse({
      apiKey: 'test-api-key',
      systemInstruction: 'INSTRUCCIÓN DEL INBOX',
      contextPrompt: 'Contexto grounded de prueba',
      grounding,
      responseContext,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suggestion).toBe('Respuesta generada');
    expect(body.lastMessageIsOutbound).toBe(false);
    expect(body.proposedActions).toHaveLength(1);
    expect(body.proposedActions[0]).toMatchObject({
      type: 'apply_tag',
      label: 'Etiquetar',
      reason: 'Hay interés',
      requiresConfirmation: true,
      payload: { tagName: 'Interés' },
    });
    expect(body.proposedActions[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(body.proposedActions[0].id).not.toBe('model-owned-id');
  });
});
