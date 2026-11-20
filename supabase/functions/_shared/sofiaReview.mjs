/**
 * Revisor del borrador. No bloquea el envío: solo devuelve un veredicto.
 * Sonnet 5.5 responde con JSON schema. No imprime el chat.
 */

export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    veredicto: { type: 'string', enum: ['aprobar', 'devolver', 'riesgo'] },
    feedback: { type: 'string' },
    contexto_faltante: { type: 'string' },
  },
  required: ['veredicto', 'feedback', 'contexto_faltante'],
};

export function normalizeReview(raw) {
  const verdict = ['aprobar', 'devolver', 'riesgo'].includes(raw?.veredicto)
    ? raw.veredicto
    : 'riesgo';
  return {
    verdict,
    feedback: String(raw?.feedback ?? '').slice(0, 500),
    missing: String(raw?.contexto_faltante ?? '').slice(0, 300),
  };
}

export async function reviewDraft(params) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': params.anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 400,
      system: 'Revisas un borrador de Sofía antes de que una persona lo envíe. No bloqueas el envío. aprueba si cumple las reglas. devuelve si se puede corregir con una nota. riesgo si hay cuenta, pago, precio inventado o una promesa indebida. La nota tiene que ser concreta.',
      output_config: { format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
      messages: [{
        role: 'user',
        content: JSON.stringify({
          reglas: params.rules,
          contexto: String(params.context ?? '').slice(0, 4000),
          borrador: params.draft,
        }),
      }],
    }),
  });
  if (!response.ok) {
    let kind = '';
    try {
      const body = await response.json();
      kind = typeof body?.error?.type === 'string' ? body.error.type : '';
    } catch {
      kind = '';
    }
    throw new Error(`revisor ${response.status} ${kind}`.trim());
  }
  const payload = await response.json();
  const text = payload?.content?.find((block) => block.type === 'text')?.text ?? '';
  return {
    review: normalizeReview(JSON.parse(text)),
    inputTokens: payload?.usage?.input_tokens ?? 0,
    outputTokens: payload?.usage?.output_tokens ?? 0,
  };
}
