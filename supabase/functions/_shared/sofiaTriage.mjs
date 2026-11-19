/**
 * Clasifica imágenes y documentos con el texto de alrededor.
 * No mira el archivo y no toca videos. Si no está seguro, dice duda.
 */

import { llmCostUsd } from './llmCost.mjs';

export const TRIAGE_LABELS = ['util', 'nuestro', 'ruido', 'duda'];

const SYSTEM = [
  'Clasificas un adjunto de WhatsApp de Prosavis Limpieza usando solo el texto de alrededor.',
  'util: sirve para el servicio (comprobante, foto del lugar, lista de tareas, dirección escrita).',
  'nuestro: es un archivo de Prosavis (catálogo, cotización, RUT, tarifas, plantilla).',
  'ruido: sticker, meme, imagen que no aporta, publicidad de otro.',
  'duda: el texto no alcanza. No adivines. Si dudas, la etiqueta es duda.',
].join(' ');

const SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', enum: TRIAGE_LABELS },
    motivo: { type: 'string' },
  },
  required: ['label', 'motivo'],
};

export function normalizeTriage(input) {
  const label = TRIAGE_LABELS.includes(input?.label) ? input.label : 'duda';
  const motivo = String(input?.motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return { label, motivo: motivo || 'sin motivo' };
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

async function neighbors(url, key, row) {
  const before = await rest(
    url,
    key,
    `whatsapp_message_log?select=direction,message_body,caption&conversation_stable_key=eq.${encodeURIComponent(row.conversation_stable_key)}&created_at=lt.${encodeURIComponent(row.created_at)}&order=created_at.desc&limit=5`,
  );
  const after = await rest(
    url,
    key,
    `whatsapp_message_log?select=direction,message_body,caption&conversation_stable_key=eq.${encodeURIComponent(row.conversation_stable_key)}&created_at=gt.${encodeURIComponent(row.created_at)}&order=created_at.asc&limit=5`,
  );
  const line = (item) => {
    const who = item.direction === 'inbound' ? 'cliente' : 'equipo';
    return `${who}: ${redact(item.message_body || item.caption).slice(0, 180)}`;
  };
  return {
    antes: (before ?? []).reverse().map(line),
    despues: (after ?? []).map(line),
  };
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 520, 529]);

async function gemini(apiKey, model, prompt) {
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: SCHEMA,
          maxOutputTokens: 2048,
    },
  });
  let response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: payload,
    },
  );
  for (let attempt = 0; attempt < 3 && RETRYABLE.has(response.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: payload,
      },
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(body?.error?.message ?? '').slice(0, 160);
    throw new Error(`modelo ${response.status} ${message}`);
  }
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('json');
  }
  const usage = body.usageMetadata ?? {};
  return {
    note: normalizeTriage(parsed),
    inputTokens: Number(usage.promptTokenCount) || 0,
    outputTokens: (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0),
  };
}

export async function runTriageRules({ supabaseUrl, serviceKey }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sofia_media_triage_rules`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) throw new Error(`Supabase ${response.status} reglas`);
  return response.json();
}

export async function runTriageClassify({
  supabaseUrl,
  serviceKey,
  geminiKey,
  model,
  usdMax,
  limit,
  runId,
}) {
  if (!geminiKey) return { clasificados: 0, gastado_usd: 0, detenido_por_tope: false, error: 'sin_clave' };
  const cap = Number.isFinite(usdMax) && usdMax > 0 ? usdMax : 8;
  const batch = Math.min(Math.max(Number(limit) || 12, 1), 20);
  const rows = await rest(
    supabaseUrl,
    serviceKey,
    `whatsapp_message_log?select=id,conversation_stable_key,created_at,media_type,filename,caption,direction&media_triage_label=is.null&or=(media_triage_reason.is.null,media_triage_reason.neq.reintento)&media_type=in.(image,document)&order=created_at.asc&limit=${batch}`,
  );
  let spent = 0;
  let classified = 0;
  let doubts = 0;
  let stopped = false;
  let firstFailure = null;
  for (const row of rows ?? []) {
    if (spent >= cap) {
      stopped = true;
      break;
    }
    try {
      const around = await neighbors(supabaseUrl, serviceKey, row);
      const prompt = JSON.stringify({
        tipo: row.media_type,
        archivo: redact(row.filename).slice(0, 80),
        pie: redact(row.caption).slice(0, 180),
        quien_lo_envio: row.direction === 'inbound' ? 'cliente' : 'equipo',
        antes: around.antes,
        despues: around.despues,
      });
      const result = await gemini(geminiKey, model || 'gemini-3.8-flash', prompt);
      const cost = llmCostUsd('google', result.inputTokens, result.outputTokens);
      spent += cost;
      await rest(supabaseUrl, serviceKey, 'sofia_llm_usage', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          provider: 'google',
          model: model || 'gemini-3.8-flash',
          purpose: 'triage',
          run_id: runId ?? null,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_usd: cost,
        }),
      });
      await rest(supabaseUrl, serviceKey, `whatsapp_message_log?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          media_triage_label: result.note.label,
          media_triage_reason: result.note.motivo,
          media_triage_at: new Date().toISOString(),
        }),
      });
      classified += 1;
      if (result.note.label === 'duda') doubts += 1;
    } catch (error) {
      firstFailure = error instanceof Error ? error.message.slice(0, 160) : 'otro';
      await rest(supabaseUrl, serviceKey, `whatsapp_message_log?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ media_triage_reason: 'reintento' }),
      }).catch(() => null);
    }
  }
  return {
    clasificados: classified,
    dudas: doubts,
    gastado_usd: Math.round(spent * 1_000_000) / 1_000_000,
    detenido_por_tope: stopped,
    primer_fallo: firstFailure,
    quedaban_en_el_lote: (rows ?? []).length,
  };
}

async function countWhere(url, key, filter) {
  const response = await fetch(`${url}/rest/v1/whatsapp_message_log?select=id&${filter}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const total = (response.headers.get('content-range') ?? '').split('/')[1];
  return Number(total) || 0;
}

export async function triageReport({ supabaseUrl, serviceKey }) {
  const counts = {
    util: await countWhere(supabaseUrl, serviceKey, 'media_type=in.(image,document,sticker)&media_triage_label=eq.util'),
    nuestro: await countWhere(supabaseUrl, serviceKey, 'media_type=in.(image,document,sticker)&media_triage_label=eq.nuestro'),
    ruido: await countWhere(supabaseUrl, serviceKey, 'media_type=in.(image,document,sticker)&media_triage_label=eq.ruido'),
    duda: await countWhere(supabaseUrl, serviceKey, 'media_type=in.(image,document,sticker)&media_triage_label=eq.duda'),
    sin_etiqueta: await countWhere(supabaseUrl, serviceKey, 'media_type=in.(image,document)&media_triage_label=is.null'),
  };
  const samples = {};
  for (const label of ['duda', 'util', 'nuestro', 'ruido']) {
    const rows = await rest(
      supabaseUrl,
      serviceKey,
      `whatsapp_message_log?select=id,media_type,filename,caption,media_triage_reason&media_triage_label=eq.${label}&order=created_at.desc&limit=${label === 'duda' ? 8 : 3}`,
    );
    samples[label] = (rows ?? []).map((row) => ({
      id: row.id,
      tipo: row.media_type,
      archivo: redact(row.filename).slice(0, 80),
      pie: redact(row.caption).slice(0, 120),
      motivo: row.media_triage_reason,
    }));
  }
  return { cuentas: counts, muestras: samples };
}
