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
      max_tokens: 800,
      thinking: { type: 'between_tools' },
      system: 'Revisas un borrador de Sofía antes de que una persona lo envíe. No bloqueas el envío. aprueba si cumple las reglas. devuelve si se puede corregir con una nota. riesgo si hay cuenta, pago, precio inventado o una promesa indebida. La nota tiene que ser concreta. Una dirección que ya está en el contexto, dicha por la clienta o por el equipo, no es inventada: se puede repetir. Si no está, pida la dirección. No ofrezca horas del reloj ni diga que hay disponibilidad si el contexto no trae un cupo del calendario. Si falta la hora de inicio, pídala. No diga que la cita quedó agendada.',
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: REVIEW_SCHEMA },
      },
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
      const tipo = typeof body?.error?.type === 'string' ? body.error.type : '';
      const nota = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 80) : '';
      kind = `${tipo} ${nota}`.trim();
    } catch {
      kind = '';
    }
    throw new Error(`revisor ${response.status} ${kind}`.trim());
  }
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error('revisor cuerpo vacio');
  const types = (payload.content ?? []).map((block) => block?.type ?? 'otro').join(',') || 'sin-bloques';
  const text = (payload.content ?? []).map((block) => block?.text ?? '').join('');
  if (!text.trim()) {
    throw new Error(`revisor vacio ${payload.stop_reason ?? 'sin-motivo'} ${types}`.trim());
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`revisor json ${payload.stop_reason ?? 'sin-motivo'} ${types}`.trim());
  }
  return {
    review: normalizeReview(parsed),
    inputTokens: payload?.usage?.input_tokens ?? 0,
    outputTokens: payload?.usage?.output_tokens ?? 0,
  };
}
