/**
 * Diagnóstico cualitativo de un chat. Sonnet 5.5 rechaza tool_choice forzado
 * ("type tool and any are not supported"), así que el esquema va en
 * output_config.format y la respuesta es JSON. No imprime el chat ni la clave.
 */

import { llmCostUsd } from './llmCost.mjs';

export const DIAGNOSIS_FLOWS = [
  'cotizacion',
  'agenda',
  'pago',
  'queja',
  'empleo',
  'cobertura',
  'reactivacion',
  'informacion',
  'otro',
];

export const DIAGNOSIS_ERRORS = [
  'tuteo',
  'largo',
  'precio_inventado',
  'confirmo_pago',
  'pidio_dato_que_ya_estaba',
  'no_escalo_queja',
  'no_escalo_empleo',
  'ofrecio_fuera_de_cobertura',
  'prometio_auxiliar',
  'silencio_largo',
  'otro',
];

export const DIAGNOSIS_STAGES = [
  'saludo',
  'datos',
  'propuesta',
  'cierre',
  'post_servicio',
  'perdido',
];

const SYSTEM = [
  'Diagnosticas cómo respondió el equipo de Prosavis Limpieza en un chat ya cerrado.',
  'No inventes datos. No copies nombres, teléfonos, direcciones ni números de cuenta.',
  'Usa la tool diagnostico. Elige flujos, etapa y errores solo del catálogo.',
  'Juzga empatía, brevedad, trato de usted, y hechos de limpieza: 4, 6 u 8 horas;',
  'hora adicional de 22000 solo sobre 4 o 6; cobertura Pereira y Dosquebradas.',
  'Una queja, un empleo o un precio especial se escalan a una persona.',
  'sofia_puede_tomar_control es true solo si el caso cabe en esas reglas y no hubo un error grave.',
  'funciono, mejora, siguiente_accion y motivo_control son una oración cada uno, de menos de 180 caracteres.',
].join(' ');

export const DIAGNOSIS_TOOL = {
  name: 'diagnostico',
  description: 'Nota estructurada de un chat de limpieza. Sin datos personales.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      flujos: { type: 'array', items: { type: 'string', enum: DIAGNOSIS_FLOWS } },
      etapa: { type: 'string', enum: DIAGNOSIS_STAGES },
      errores: { type: 'array', items: { type: 'string', enum: DIAGNOSIS_ERRORS } },
      funciono: { type: 'string', description: 'Una oración, menos de 180 caracteres.' },
      mejora: { type: 'string', description: 'Una oración, menos de 180 caracteres.' },
      siguiente_accion: { type: 'string', description: 'Una oración, menos de 180 caracteres.' },
      sofia_puede_tomar_control: { type: 'boolean' },
      motivo_control: { type: 'string', description: 'Una oración, menos de 180 caracteres.' },
      etiquetas: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'flujos',
      'etapa',
      'errores',
      'funciono',
      'mejora',
      'siguiente_accion',
      'sofia_puede_tomar_control',
      'motivo_control',
      'etiquetas',
    ],
  },
};

function clip(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function fromCatalog(value, catalog) {
  const list = Array.isArray(value) ? value : [];
  const picked = list.filter((item) => catalog.includes(item));
  return picked.length > 0 ? [...new Set(picked)] : ['otro'];
}

/** Normaliza la tool. Lanza si falta un campo obligatorio. */
export function normalizeDiagnosis(input) {
  if (!input || typeof input !== 'object') throw new Error('json');
  if (!DIAGNOSIS_STAGES.includes(input.etapa)) throw new Error('json');
  if (typeof input.sofia_puede_tomar_control !== 'boolean') throw new Error('json');
  const flujos = fromCatalog(input.flujos, DIAGNOSIS_FLOWS);
  const errores = Array.isArray(input.errores)
    ? [...new Set(input.errores.filter((item) => DIAGNOSIS_ERRORS.includes(item)))]
    : [];
  const etiquetas = (Array.isArray(input.etiquetas) ? input.etiquetas : [])
    .map((item) => clip(item, 40))
    .filter(Boolean)
    .slice(0, 8);
  const funciono = clip(input.funciono, 240);
  const mejora = clip(input.mejora, 240);
  const siguiente = clip(input.siguiente_accion, 240);
  if (!funciono || !mejora || !siguiente || !clip(input.motivo_control, 240)) throw new Error('json');
  return {
    flujos: flujos.length > 0 ? flujos : ['otro'],
    etapa: input.etapa,
    errores,
    funciono,
    mejora,
    siguiente_accion: siguiente,
    sofia_puede_tomar_control: input.sofia_puede_tomar_control,
    motivo_control: clip(input.motivo_control, 240),
    etiquetas,
    bien: funciono,
    mal: errores.length > 0 ? errores.join(', ') : 'sin error marcado',
    mejor: mejora,
  };
}

function structuredNote(body) {
  const text = (body?.content ?? []).map((part) => part.text ?? '').join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('json');
  }
}

function redact(text) {
  return String(text ?? '')
    .replace(/\d{7,}/g, '[numero]')
    .replace(/\b(?:calle|carrera|cra\.?|kr\.?|diagonal|transversal|avenida|av\.?|manzana|apto|apartamento)\b[^.]{0,48}/gi, '[direccion]');
}

async function rest(url, key, path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status} ${path.split('?')[0]}`);
  return response.json().catch(() => null);
}

async function history(url, key, stableKey) {
  const rows = await rest(
    url,
    key,
    `whatsapp_message_log?select=direction,message_body,author_kind,template_name,created_at&conversation_stable_key=eq.${encodeURIComponent(stableKey)}&or=(media_triage_label.is.null,media_triage_label.eq.util,media_triage_label.eq.duda)&order=created_at.desc&limit=40`,
  );
  return (rows ?? []).reverse().map((row) => ({
    quien: row.direction === 'inbound' ? 'cliente' : (row.author_kind || 'equipo'),
    texto: redact(row.message_body).slice(0, 280),
    plantilla: row.template_name || null,
  }));
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 520, 529]);

async function sonnet(anthropicKey, model, chat) {
  const payload = JSON.stringify({
    model,
    max_tokens: 1600,
    system: SYSTEM,
    output_config: {
      format: { type: 'json_schema', schema: DIAGNOSIS_TOOL.input_schema },
    },
    messages: [{ role: 'user', content: JSON.stringify(chat) }],
  });
  const headers = {
    'x-api-key': anthropicKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  let response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: payload,
  });
  for (let attempt = 0; attempt < 3 && RETRYABLE.has(response.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: payload,
    });
  }
  const body = await response.json().catch(() => ({}));
  const usage = {
    inputTokens: Number(body.usage?.input_tokens) || 0,
    outputTokens: Number(body.usage?.output_tokens) || 0,
  };
  if (response.status === 404) throw Object.assign(new Error('modelo 404'), { usage });
  if (!response.ok) {
    const message = String(body?.error?.message ?? '').slice(0, 160);
    throw Object.assign(new Error(`modelo ${response.status} ${message}`), { usage });
  }
  if (body.stop_reason === 'max_tokens') throw Object.assign(new Error('max_tokens'), { usage });
  try {
    return { note: normalizeDiagnosis(structuredNote(body)), ...usage };
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error('json'), { usage });
  }
}

function failureKind(error) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'max_tokens') return 'max_tokens';
  if (message.startsWith('Supabase') || message.startsWith('modelo')) return message.split('?')[0].slice(0, 160);
  if (message.includes('json') || message.includes('JSON')) return 'json';
  return 'otro';
}

function stopsRun(kind) {
  return kind.startsWith('Supabase') || /^modelo (400|401|403|404)/.test(kind);
}

function gateway(kind) {
  return kind.startsWith('modelo ') && !stopsRun(kind);
}

function skipsChat(kind) {
  return kind === 'json' || kind === 'max_tokens' || kind === 'otro' || gateway(kind);
}

/**
 * Diagnostica hasta `limit` chats pendientes sin pasar `usdMax`.
 * Se puede reanudar: un chat con flujos ya escrito se salta.
 */
export async function runDiagnosisBatch({
  supabaseUrl,
  serviceKey,
  anthropicKey,
  model,
  usdMax,
  limit,
  runId,
}) {
  if (!serviceKey) throw new Error('Supabase sin clave');
  if (!anthropicKey || !model) {
    return { sonnet: anthropicKey ? 'sin_modelo' : 'sin_clave', revisados: 0, fallos: 0, gastado_usd: 0, detenido_por_tope: false, pendientes: null };
  }
  const cap = Number.isFinite(usdMax) && usdMax > 0 ? usdMax : 60;
  const batch = Math.min(Math.max(Number(limit) || 8, 1), 30);
  const pending = [];
  for (let offset = 0; offset < 5000 && pending.length < batch; offset += 1000) {
    const page = await rest(
      supabaseUrl,
      serviceKey,
      `whatsapp_study_chat_reviews?select=stable_key,rubric&flujos=is.null&diagnostico_error=is.null&order=stable_key.asc&limit=1000&offset=${offset}`,
    );
    for (const row of page ?? []) {
      const messages = Number(row.rubric?.entrantes ?? 0) + Number(row.rubric?.salientes ?? 0);
      if (messages >= 1) pending.push(row);
      if (pending.length >= batch) break;
    }
    if (!page || page.length < 1000) break;
  }

  let reviewed = 0;
  let failed = 0;
  let marked = 0;
  let spent = 0;
  let firstFailure = '';
  let stopped = false;
  let systemic = false;
  let cursor = 0;

  async function remember(usage) {
    const inputTokens = Number(usage?.inputTokens) || 0;
    const outputTokens = Number(usage?.outputTokens) || 0;
    if (inputTokens === 0 && outputTokens === 0) return 0;
    const cost = llmCostUsd('anthropic', inputTokens, outputTokens);
    spent += cost;
    await rest(supabaseUrl, serviceKey, 'sofia_llm_usage', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        provider: 'anthropic',
        model,
        purpose: 'diagnosis',
        run_id: runId ?? null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
      }),
    });
    return cost;
  }

  const worker = async () => {
    while (cursor < pending.length) {
      if (spent >= cap) {
        stopped = true;
        return;
      }
      const index = cursor;
      cursor += 1;
      const row = pending[index];
      try {
        const messages = await history(supabaseUrl, serviceKey, row.stable_key);
        const result = await sonnet(anthropicKey, model, { rubrica: row.rubric, mensajes: messages });
        await remember(result);
        const note = result.note;
        await rest(supabaseUrl, serviceKey, `whatsapp_study_chat_reviews?stable_key=eq.${encodeURIComponent(row.stable_key)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            model: 'sonnet',
            bien: note.bien,
            mal: note.mal,
            mejor: note.mejor,
            flujos: note.flujos,
            etapa: note.etapa,
            errores: note.errores,
            funciono: note.funciono,
            mejora: note.mejora,
            siguiente_accion: note.siguiente_accion,
            sofia_puede_tomar_control: note.sofia_puede_tomar_control,
            motivo_control: note.motivo_control,
            etiquetas: note.etiquetas,
          }),
        });
        if (note.errores.length === 0) {
          const reply = [...messages].reverse().find((message) => message.quien !== 'cliente' && message.texto);
          if (reply) {
            await rest(supabaseUrl, serviceKey, 'sofia_example_bank', {
              method: 'POST',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({
                stable_key: row.stable_key,
                flujo: note.flujos[0] ?? 'otro',
                texto: reply.texto.slice(0, 240),
              }),
            });
          }
        }
        reviewed += 1;
      } catch (error) {
        failed += 1;
        const kind = failureKind(error);
        if (!firstFailure) firstFailure = kind;
        await remember(error?.usage).catch(() => null);
        if (stopsRun(kind)) {
          systemic = true;
          stopped = true;
          return;
        }
        if (!skipsChat(kind)) {
          systemic = true;
          stopped = true;
          return;
        }
        await rest(supabaseUrl, serviceKey, `whatsapp_study_chat_reviews?stable_key=eq.${encodeURIComponent(row.stable_key)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ diagnostico_error: gateway(kind) ? 'reintento' : kind }),
        }).catch(() => null);
        marked += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: 3 }, () => worker()));
  return {
    sonnet: model,
    revisados: reviewed,
    fallos: failed,
    marcados: marked,
    gastado_usd: Math.round(spent * 1_000_000) / 1_000_000,
    detenido_por_tope: stopped && !systemic,
    fallo_sistemico: systemic,
    primer_fallo: firstFailure || null,
    tomados: pending.length,
  };
}
