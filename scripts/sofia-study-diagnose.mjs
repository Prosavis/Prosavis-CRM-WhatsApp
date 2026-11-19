// Diagnóstico de cómo respondemos. La rúbrica medible se cuenta en SQL.
// La parte cualitativa usa Sonnet solo si hay ANTHROPIC_API_KEY en el entorno.
// No envía mensajes ni imprime chats.

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropic = process.env.ANTHROPIC_API_KEY || '';
const model = process.env.ANTHROPIC_MODEL || '';
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const cap = Number(process.env.SOFIA_DIAGNOSE_MAX || '40');
const requested = limitArg ? Number(limitArg.slice('--limit='.length)) : cap;
const limit = Math.min(requested, Number.isFinite(cap) && cap > 0 ? cap : 40);

function redact(text) {
  return String(text ?? '')
    .replace(/\d{7,}/g, '[numero]')
    .replace(/\b(?:calle|carrera|cra\.?|kr\.?|diagonal|transversal|avenida|av\.?|manzana|apto|apartamento)\b[^.]{0,48}/gi, '[direccion]');
}

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status} ${path.split('?')[0]}`);
  return response.json().catch(() => null);
}

async function measurable() {
  try {
    return await rest('rpc/refresh_whatsapp_study_reviews', { method: 'POST', body: '{}' });
  } catch {
    return 'omitido';
  }
}

async function pages(path) {
  const rows = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const page = await rest(`${path}&limit=1000&offset=${offset}`);
    rows.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }
  return rows;
}

async function history(stableKey) {
  const rows = await rest(
    `whatsapp_message_log?select=direction,message_body,author_kind,template_name,created_at&conversation_stable_key=eq.${encodeURIComponent(stableKey)}&order=created_at.desc&limit=40`,
  );
  return (rows ?? []).reverse().map((row) => ({
    quien: row.direction === 'inbound' ? 'cliente' : (row.author_kind || 'equipo'),
    texto: redact(row.message_body).slice(0, 280),
    plantilla: row.template_name || null,
  }));
}

async function sonnet(chat) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropic,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: 'Diagnosticas un chat de Prosavis Limpieza. No inventes datos. Responde solo JSON con bien, mal y mejor. Cada uno es una línea, sin nombres ni teléfonos. Juzga empatía, brevedad, hechos de limpieza (4, 6 u 8 horas; hora adicional 22000; cobertura Pereira y Dosquebradas) y si escaló una queja, un empleo o un precio especial.',
      messages: [{ role: 'user', content: JSON.stringify(chat) }],
    }),
  });
  if (response.status === 404) throw new Error('modelo 404');
  if (!response.ok) throw new Error(`modelo ${response.status}`);
  const body = await response.json();
  const text = (body.content ?? []).map((part) => part.text ?? '').join('');
  const json = text.match(/\{[\s\S]*\}/);
  return JSON.parse(json ? json[0] : text);
}

async function qualitative() {
  if (!anthropic || !model) return { sonnet: anthropic ? 'sin_modelo' : 'sin_clave', revisados: 0 };
  const pending = (await pages(
    'whatsapp_study_chat_reviews?select=stable_key,rubric&model=eq.reglas&bien=is.null&order=stable_key.asc',
  )).filter((row) => Number(row.rubric?.entrantes ?? 0) + Number(row.rubric?.salientes ?? 0) >= 5)
    .slice(0, limit);
  let reviewed = 0;
  let failed = 0;
  let firstFailure = '';
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const row = pending[cursor];
      cursor += 1;
      try {
        const messages = await history(row.stable_key);
        const note = await sonnet({ rubrica: row.rubric, mensajes: messages });
        await rest(`whatsapp_study_chat_reviews?stable_key=eq.${encodeURIComponent(row.stable_key)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            model: 'sonnet',
            bien: String(note.bien ?? '').slice(0, 240),
            mal: String(note.mal ?? '').slice(0, 240),
            mejor: String(note.mejor ?? '').slice(0, 240),
          }),
        });
        reviewed += 1;
      } catch (error) {
        failed += 1;
        if (!firstFailure) {
          const message = error instanceof Error ? error.message : '';
          if (message.startsWith('Supabase') || message.startsWith('modelo')) {
            firstFailure = message.split('?')[0].slice(0, 60);
          } else if (message.includes('JSON')) {
            firstFailure = 'json';
          } else {
            firstFailure = 'otro';
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 2 }, () => worker()));
  return { sonnet: model, revisados: reviewed, fallos: failed, primer_fallo: firstFailure || null };
}

async function main() {
  if (!key) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY. No se escribió nada.');
    process.exit(1);
  }
  const counted = await measurable();
  const quality = await qualitative();
  console.log(JSON.stringify({ rubrica_medida: counted, ...quality }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'falló');
  process.exit(1);
});
