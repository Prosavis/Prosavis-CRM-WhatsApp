/**
 * Outreach B2B empresas: plantilla, HTML correo, promote a crm_directory.
 */

export const EMPRESAS_WA_TEMPLATE = 'outreach_empresas_limpieza_v2';
export const EMPRESAS_WA_CAMPAIGN = 'promo_pro_empresas';
export const EMPRESAS_TAG = 'Empresas';
export const EMPRESAS_TAG_ID = '656473d8-4ae3-4c53-a5e3-81d9217537c2';
export const EMAIL_ENVIADO_TAG = 'email enviado';
export const EMAIL_ENVIADO_TAG_ID = '96d31954-4022-4136-b966-a254d784da4b';

export const EMPRESAS_WA_BODY =
  'Buenos días, somos Prosavis SAS.\n\n' +
  'Ofrecemos limpieza para empresas, oficinas y conjuntos, con cotización a medida.\n\n' +
  'También limpieza por horas:\n\n' +
  '4 horas\n' +
  '$88.000\n\n' +
  '6 horas\n' +
  '$118.000\n\n' +
  '8 horas\n' +
  '$148.000\n\n' +
  'Si les sirve una visita o una cotización, responden acá y les armamos la oferta.';

export type EmpresasLeadRow = {
  id: string;
  name: string | null;
  phone_key: string | null;
  email: string | null;
  address: string | null;
  municipio: string | null;
  nit: string | null;
  ciiu: string | null;
  sources: string[] | null;
};

export function e164FromPhoneKey(phoneKey: string): string {
  const digits = phoneKey.replace(/\D/g, '').slice(-10);
  return `57${digits}`;
}

export function directoryNotes(row: EmpresasLeadRow): string | null {
  const bits: string[] = [];
  if (row.ciiu) bits.push(`CIIU ${row.ciiu}`);
  if (row.nit) bits.push(`NIT ${row.nit}`);
  if (row.municipio) bits.push(row.municipio);
  if (row.sources?.length) bits.push(`origen: ${row.sources.join(', ')}`);
  return bits.length ? bits.join(' · ') : null;
}

export function buildDirectoryUpsert(row: EmpresasLeadRow): Record<string, unknown> {
  const name = (row.name || '').trim();
  const entry: Record<string, unknown> = {
    status: 'active',
    source: 'LEAD',
    channels: row.phone_key ? ['WHATSAPP'] : ['EMAIL'],
  };
  if (name) {
    entry.full_name = name;
    entry.display_name = name;
  }
  if (row.phone_key) {
    entry.phone = `+57${row.phone_key}`;
    entry.phone_key = row.phone_key;
  }
  if (row.email) entry.email = row.email;
  if (row.address) entry.address = row.address;
  const notes = directoryNotes(row);
  if (notes) entry.notes = notes;
  entry.metadata = {
    outreach: {
      ciiu: row.ciiu,
      nit: row.nit,
      municipio: row.municipio,
      sources: row.sources ?? [],
      leadId: row.id,
    },
  };
  return entry;
}

/** Quita comillas/artefactos de Cámara y deja un nombre usable en el saludo. */
export function displayCompanyName(raw: string | null | undefined): string {
  let text = (raw || '').replace(/\u00a0/g, ' ').trim();
  text = text.replace(/^[&'"«»“”‘’`?\s]+/, '').replace(/[&'"«»“”‘’`?\s]+$/, '');
  text = text.replace(/\s+/g, ' ').trim();
  const letters = text.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, '');
  const upper = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
  if (letters.length > 4 && upper / letters.length > 0.65) {
    text = text
      .toLowerCase()
      .replace(/(^|[\s./-])([a-záéíóúñ])/g, (_all, prefix: string, ch: string) => prefix + ch.toUpperCase());
  }
  text = text.replace(/\s+s\.?\s*a\.?\s*s\.?\s*$/i, ' S.A.S.');
  return text;
}

/** Actividad humana desde CIIU (`G4530 ** Comercio de partes…`). */
export function activityFromCiiu(ciiu: string | null | undefined): string | null {
  if (!ciiu) return null;
  const star = ciiu.indexOf('**');
  let text = star >= 0 ? ciiu.slice(star + 2) : ciiu.replace(/^[A-Z]\d+\s*/, '');
  text = text.replace(/\s{2,}/g, ', ').replace(/\s+/g, ' ').trim().toLowerCase();
  text = text.replace(/\s*n\.c\.p\.?\s*$/i, '').trim();
  text = text
    .replace(/\bteneduria\b/g, 'teneduría')
    .replace(/\bauditoria\b/g, 'auditoría')
    .replace(/\basesoria\b/g, 'asesoría');
  if (text.length < 8) return null;
  return text;
}

export function displayMunicipio(raw: string | null | undefined): string | null {
  const text = (raw || '').trim();
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** Sitio reconocible (edificio, CC) si el crudo lo trae; si no, null. */
export function landmarkFromAddress(address: string | null | undefined): string | null {
  const text = (address || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const match = text.match(
    /\b(edificio|ed\.?|centro comercial|c\.?c\.?|torre|hotel|plaza|plazoleta)\b[^,]{0,48}/i,
  );
  if (!match) return null;
  const raw = match[0].replace(/\s+/g, ' ').trim();
  return raw
    .toLowerCase()
    .replace(/(^|[\s./-])([a-záéíóúñ])/g, (_all, prefix: string, ch: string) => prefix + ch.toUpperCase());
}

export function empresasEmailCopy(row: Pick<EmpresasLeadRow, 'name' | 'address' | 'municipio' | 'ciiu'>): {
  displayName: string;
  greeting: string;
  headline: string;
  subject: string;
  opening: string;
} {
  const displayName = displayCompanyName(row.name);
  const city = displayMunicipio(row.municipio);
  const activity = activityFromCiiu(row.ciiu);
  const landmark = landmarkFromAddress(row.address);
  const greeting = displayName
    ? `Buenos días, equipo de ${displayName}:`
    : 'Buenos días:';
  const headline = displayName
    ? `Limpieza a la medida de ${displayName}`
    : 'Limpieza a la medida de su empresa';
  const subject = displayName
    ? `${displayName}: cotización de limpieza a su medida — Prosavis`
    : 'Cotización de limpieza a la medida de su empresa — Prosavis';

  const bits: string[] = [];
  if (displayName && activity && city) {
    bits.push(
      `Vimos que ${displayName} se dedica a ${activity} en ${city}.`,
    );
  } else if (displayName && city) {
    bits.push(`Le escribimos a ${displayName}, en ${city}.`);
  } else if (displayName) {
    bits.push(`Le escribimos a ${displayName}.`);
  } else {
    bits.push('Le escribimos desde Prosavis SAS, en Pereira.');
  }
  if (landmark) {
    bits.push(`En ${landmark} podemos cubrir oficinas, locales o zonas comunes, según lo que ustedes necesiten.`);
  } else {
    bits.push(
      'Armamos la limpieza de oficinas, locales y conjuntos alrededor de su operación: horarios, áreas y frecuencia a su medida.',
    );
  }
  bits.push(
    'No hay un paquete único ni una tarifa de hogar. Visitamos, entendemos lo que piden y les cotizamos. Si el alcance cambia, la oferta también.',
  );
  return { displayName, greeting, headline, subject, opening: bits.join(' ') };
}

export function composeEmpresasEmail(
  row: Pick<EmpresasLeadRow, 'name' | 'address' | 'municipio' | 'ciiu'>,
  to: string,
): {
  to: string;
  subject: string;
  body: string;
  htmlBody: string;
} {
  const copy = empresasEmailCopy(row);
  const htmlBody =
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<title>${escapeHtml(copy.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:#F2F5F8;-webkit-text-size-adjust:100%;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F2F5F8;">` +
    `<tr><td align="center" style="padding:20px 10px 32px;">` +
    `<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #C5D4E3;">` +
    `<tr><td align="center" style="padding:28px 28px 16px;">` +
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:900;letter-spacing:6px;color:#FF7700;">PROSAVIS</p>` +
    `<p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1.5px;color:#5A6B7B;text-transform:uppercase;">Conectando servicios de calidad</p>` +
    `<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.3;font-weight:bold;color:#002446;">${escapeHtml(copy.headline)}</p>` +
    `</td></tr>` +
    `<tr><td style="height:6px;line-height:6px;font-size:0;background-color:#FF7700;">&nbsp;</td></tr>` +
    `<tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#002446;">` +
    `<p style="margin:0 0 16px;">${escapeHtml(copy.greeting)}</p>` +
    `<p style="margin:0 0 16px;">${escapeHtml(copy.opening)}</p>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;"><tr>` +
    valueCell('A su medida', 'Oficinas, locales y conjuntos. El alcance lo definen ustedes.') +
    valueCell('Equipo propio', 'Gente de Prosavis. Puntuales, con recambio si hace falta.') +
    valueCell('Una conversación', 'Les armamos la cotización. Sin tarifa de hogar.') +
    `</tr></table>` +
    `<p style="margin:0 0 8px;font-weight:bold;color:#002446;">¿Les armamos la cotización?</p>` +
    `<p style="margin:0 0 16px;">Responda este correo o escríbanos al ` +
    `<a href="https://wa.me/573122531271" style="color:#FF7700;font-weight:bold;">312 253 1271</a>. ` +
    `En breve coordinamos una visita o un alcance por escrito.</p>` +
    `<p style="margin:24px 0 0;font-size:12px;color:#5A6B7B;">Si no desea más correos, responda BAJA.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:8px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#5A6B7B;">` +
    `Nicolás Ceballos Brito<br>Prosavis SAS · Pereira<br>` +
    `<a href="https://wa.me/573122531271" style="color:#002446;">+57 312 253 1271</a>` +
    ` · <a href="https://prosavis.com" style="color:#002446;">prosavis.com</a>` +
    `</td></tr></table></td></tr></table></body></html>`;
  if (htmlBody.includes('<img') || /\$\s*\d/.test(htmlBody) || /88\.000|118\.000|148\.000/.test(htmlBody)) {
    throw new Error('El correo B2B no admite <img> ni precios domésticos.');
  }
  const body = [
    copy.greeting,
    '',
    copy.opening,
    '',
    'A su medida — oficinas, locales y conjuntos.',
    'Equipo propio — puntualidad y recambio.',
    'Una conversación — cotización, sin tarifa de hogar.',
    '',
    'Responda este correo o WhatsApp 312 253 1271.',
    'Si no desea más correos, responda BAJA.',
    '',
    'Nicolás Ceballos Brito · Prosavis SAS · Pereira',
  ].join('\n');
  return { to, subject: copy.subject, body, htmlBody };
}

function valueCell(title: string, detail: string): string {
  return (
    `<td width="33%" align="center" valign="top" style="padding:4px;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F2F5F8;border:1px solid #E8EEF4;">` +
    `<tr><td style="padding:14px 10px;text-align:center;font-family:Arial,Helvetica,sans-serif;">` +
    `<p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;color:#FF7700;text-transform:uppercase;font-weight:bold;">${escapeHtml(title)}</p>` +
    `<p style="margin:0;font-size:13px;line-height:1.4;color:#002446;">${escapeHtml(detail)}</p>` +
    `</td></tr></table></td>`
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function encodeSubject(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

export function toBase64Url(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function buildRfc822(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  htmlBody: string;
}): string {
  const boundary = 'prosavis_ops_alt';
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.htmlBody,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
