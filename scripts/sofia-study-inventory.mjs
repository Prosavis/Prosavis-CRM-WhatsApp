// Inventario del estudio de chats. Solo lee mensajes, directorio y citas.
// No importa funciones de envío ni usa tokens de WhatsApp.
// Los datos quedan en whatsapp_study_contacts. No escribe archivos con teléfonos.

import { execFileSync } from 'node:child_process';

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CATALOG_MINUTES = new Set([240, 360, 480]);

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function firestoreScalar(field) {
  if (!field || typeof field !== 'object') return null;
  if (typeof field.stringValue === 'string') return field.stringValue;
  if (typeof field.timestampValue === 'string') return field.timestampValue;
  if (typeof field.integerValue === 'string') return Number(field.integerValue);
  if (typeof field.doubleValue === 'number') return field.doubleValue;
  return null;
}

function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `57${digits}`;
  if (digits.length >= 12 && digits.slice(-12).startsWith('57')) return digits.slice(-12);
  return '';
}

function gcloudToken() {
  const lines = execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
    shell: true,
  }).split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 20 && !line.includes(' '));
  const token = lines.at(-1) ?? '';
  if (!token) throw new Error('No se pudieron leer las citas');
  return token;
}

async function refreshInventory() {
  const response = await fetch(`${url}/rest/v1/rpc/refresh_whatsapp_study_contacts`, {
    method: 'POST',
    headers: headers(),
    body: '{}',
  });
  if (!response.ok) throw new Error('No se pudo refrescar el inventario');
  return response.json();
}

async function pageAppointments(token, cursor) {
  const structuredQuery = {
    from: [{ collectionId: 'appointments' }],
    orderBy: [{ field: { fieldPath: 'scheduledDate' }, direction: 'DESCENDING' }],
    limit: 500,
    select: {
      fields: [
        { fieldPath: 'clientPhone' },
        { fieldPath: 'scheduledDate' },
        { fieldPath: 'status' },
        { fieldPath: 'duration' },
      ],
    },
  };
  if (cursor) {
    structuredQuery.startAt = { values: [{ timestampValue: cursor }], before: false };
  }
  const response = await fetch(
    'https://firestore.googleapis.com/v1/projects/prosavis/databases/(default)/documents:runQuery',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    },
  );
  if (!response.ok) throw new Error('No se pudieron leer las citas');
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const fields = row.document?.fields ?? {};
    return {
      phone: phoneKey(firestoreScalar(fields.clientPhone)),
      when: firestoreScalar(fields.scheduledDate),
      status: String(firestoreScalar(fields.status) ?? ''),
      duration: firestoreScalar(fields.duration),
    };
  }).filter((row) => row.phone && row.when);
}

async function appointmentFacts() {
  const token = gcloudToken();
  const byPhone = new Map();
  let cursor = null;
  let pages = 0;
  let seen = 0;
  while (pages < 40) {
    const rows = await pageAppointments(token, cursor);
    const fresh = cursor ? rows.slice(1) : rows;
    if (fresh.length === 0) break;
    for (const row of fresh) {
      seen += 1;
      const closed = row.status === 'CANCELED' || row.status === 'REJECTED';
      const current = byPhone.get(row.phone) ?? { count: 0, last: null, offCatalog: false };
      if (!closed) current.count += 1;
      if (!current.last || String(row.when) > current.last) current.last = String(row.when);
      const minutes = Number(row.duration);
      if (!closed && Number.isFinite(minutes) && minutes > 0 && !CATALOG_MINUTES.has(minutes)) {
        current.offCatalog = true;
      }
      byPhone.set(row.phone, current);
    }
    cursor = fresh[fresh.length - 1].when;
    pages += 1;
    if (rows.length < 500) break;
  }
  return { byPhone, seen, pages };
}

async function overlay(byPhone) {
  const entries = [...byPhone.entries()];
  let updated = 0;
  for (let index = 0; index < entries.length; index += 40) {
    const slice = entries.slice(index, index + 40);
    await Promise.all(slice.map(async ([phone, fact]) => {
      const response = await fetch(
        `${url}/rest/v1/whatsapp_study_contacts?phone=eq.${phone}`,
        {
          method: 'PATCH',
          headers: headers({ Prefer: 'return=minimal' }),
          body: JSON.stringify({
            appointment_count: fact.count,
            last_appointment_at: fact.last,
            off_catalog_duration: fact.offCatalog,
          }),
        },
      );
      if (response.ok) updated += 1;
    }));
  }
  return updated;
}

async function countWhere(filter) {
  const response = await fetch(
    `${url}/rest/v1/whatsapp_study_contacts?select=phone&${filter}&limit=1`,
    { headers: headers({ Prefer: 'count=exact' }) },
  );
  if (!response.ok) throw new Error('No se pudo leer el resumen');
  const match = response.headers.get('content-range')?.match(/\/(\d+)/);
  return Number(match?.[1] ?? 0);
}

async function summary() {
  const [telefonos, conRespuesta, conCita, offCatalog, app, jobs] = await Promise.all([
    countWhere('phone=not.is.null'),
    countWhere('has_inbound=eq.true'),
    countWhere('appointment_count=gt.0'),
    countWhere('off_catalog_duration=eq.true'),
    countWhere('is_app_user=eq.true'),
    countWhere('job_stage=not.is.null'),
  ]);
  return {
    telefonos,
    con_respuesta: conRespuesta,
    sin_respuesta: telefonos - conRespuesta,
    con_cita: conCita,
    duracion_fuera_de_catalogo: offCatalog,
    en_app: app,
    postulaciones: jobs,
  };
}

async function main() {
  if (!key) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY. No se escribió nada.');
    process.exit(1);
  }
  const refreshed = await refreshInventory();
  const facts = await appointmentFacts();
  const updated = await overlay(facts.byPhone);
  const report = await summary();
  console.log(JSON.stringify({
    refrescados: refreshed,
    citas_leidas: facts.seen,
    telefonos_con_cita_en_firestore: facts.byPhone.size,
    filas_actualizadas: updated,
    ...report,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'falló');
  process.exit(1);
});
