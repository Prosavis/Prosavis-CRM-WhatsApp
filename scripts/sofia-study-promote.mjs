// Copia al cajón solo fichas de prueba sin marca de error.
// No corre si no pasas --ok=YYYY-MM-DD con la fecha de hoy en Bogotá.
// Usa el mismo formato de contextSheet: [Vigente] arriba y el diario abajo.
// No envía mensajes.

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ok = process.argv.find((arg) => arg.startsWith('--ok='))?.slice('--ok='.length) ?? '';

function bogotaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function tokensOf(tags, classification) {
  const out = [];
  for (const value of [...(tags ?? []), classification ?? '']) {
    for (const part of String(value).split(',')) {
      const token = part.trim().toLowerCase();
      if (token) out.push(token);
    }
  }
  return out;
}

function eligible(row) {
  const tokens = tokensOf(row.directory_tags, row.classification);
  const auxiliar = tokens.some((token) => token === 'auxiliares' || token.startsWith('auxiliares '));
  const ad = tokens.some((token) => ['cliente potencial', 'empresas', 'job', 'jobs', 'trabajo', 'trabajo/cv', 'trabajo / cv'].includes(token));
  const client = tokens.some((token) => token === 'agendado' || token === 'cliente' || token.startsWith('cliente '));
  if (auxiliar || ad) return true;
  if (!client) return false;
  return Number(row.appointment_count) >= 1;
}

function sheet(existing, proposal) {
  const stamp = `${bogotaToday()} ${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())}`;
  const block = `### ${stamp} · ${proposal.source}\n${proposal.entry}`;
  const previous = String(existing ?? '').trim();
  const diary = previous.includes('## Diario')
    ? previous.split('## Diario')[1].trim()
    : (previous ? `### ${stamp} · campo\n${previous}` : '');
  return `[Vigente ${stamp} Bogotá] ${proposal.vigente}\n---\n## Diario\n${[diary, block].filter(Boolean).join('\n\n')}\n`;
}

async function main() {
  if (ok !== bogotaToday()) {
    console.log(JSON.stringify({
      escrito: false,
      nota: 'No se escribió el cajón. Hace falta --ok con la fecha de hoy en Bogotá y la orden de Nicolás en este turno.',
    }));
    return;
  }
  if (!key) {
    console.error('Falta la clave de servicio. No se escribió nada.');
    process.exit(1);
  }
  const cards = await fetch(
    `${url}/rest/v1/whatsapp_client_cards?select=phone,propuesta_cajon,modo&modo=eq.prueba&version_estudio=eq.estudio-1&limit=5000`,
    { headers: headers() },
  ).then((response) => response.json());
  const reviews = await fetch(
    `${url}/rest/v1/whatsapp_client_card_reviews?select=phone,verdict&verdict=eq.error&limit=5000`,
    { headers: headers() },
  ).then((response) => response.json());
  const blocked = new Set((reviews ?? []).map((row) => row.phone));
  let written = 0;
  let skipped = 0;
  for (const card of cards ?? []) {
    const proposal = card.propuesta_cajon ?? {};
    if (blocked.has(card.phone) || !proposal.vigente || !proposal.entry || !proposal.source) {
      skipped += 1;
      continue;
    }
    const contact = await fetch(
      `${url}/rest/v1/whatsapp_study_contacts?select=directory_id,directory_tags,classification,appointment_count&phone=eq.${card.phone}&limit=1`,
      { headers: headers() },
    ).then((response) => response.json());
    const row = contact?.[0];
    if (!row?.directory_id || !eligible(row)) {
      skipped += 1;
      continue;
    }
    const duplicates = await fetch(
      `${url}/rest/v1/crm_directory?select=id&phone_key=eq.${card.phone.slice(-10)}`,
      { headers: headers({ Prefer: 'count=exact' }) },
    );
    const count = Number(duplicates.headers.get('content-range')?.split('/')?.[1] ?? 0);
    if (count !== 1) {
      skipped += 1;
      continue;
    }
    const current = await fetch(
      `${url}/rest/v1/crm_directory?select=internal_notes&id=eq.${row.directory_id}`,
      { headers: headers() },
    ).then((response) => response.json());
    const next = sheet(current?.[0]?.internal_notes, proposal);
    const saved = await fetch(`${url}/rest/v1/crm_directory?id=eq.${row.directory_id}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ internal_notes: next }),
    });
    if (saved.ok) written += 1;
    else skipped += 1;
  }
  console.log(JSON.stringify({ escrito: true, cajones: written, omitidas: skipped }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'falló');
  process.exit(1);
});
