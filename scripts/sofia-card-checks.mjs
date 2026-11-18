const CLOSED = {
  tipo_contacto: ['hogar', 'empresa', 'postulante', 'proveedor', 'equipo', 'desconocido'],
  estado: ['lead_nuevo', 'en_conversacion', 'agendado', 'cliente_activo', 'recurrente', 'inactivo', 'perdido'],
  motivo_perdida: ['precio', 'sin_cupo', 'fuera_de_cobertura', 'dejo_de_responder', 'buscaba_empleo', 'no_se_ofrece', 'cerro_por_fuera', 'solo_informandose', 'otro'],
  origen: ['anuncio_meta', 'plantilla', 'referido', 'app', 'llamada', 'organico', 'desconocido'],
  canal_habitual: ['chat_312', 'chat_311', 'app', 'llamada', 'mixto'],
  idioma: ['es', 'en', 'otro'],
  forma_de_escribir: ['texto', 'audios', 'mixto'],
  'servicio.frecuencia': ['única', 'unica', 'semanal', 'quincenal', 'mensual', 'días fijos', 'dias fijos'],
  'pago.medio_habitual': ['bancolombia_qr', 'transferencia', 'wompi', 'pide_efectivo'],
  'pago.momento': ['antes', 'mitad_y_mitad', 'despues'],
};

const HEALTH = /alergia|diagn[oó]stico|embaraz|c[aá]ncer|vih|diabetes|depresi[oó]n/i;

export function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function leafValor(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
  return Object.prototype.hasOwnProperty.call(node, 'valor') ? node.valor : undefined;
}

export function closedValueProblems(card) {
  const problems = [];
  for (const [path, allowed] of Object.entries(CLOSED)) {
    const node = path.split('.').reduce((current, key) => current?.[key], card);
    const valor = leafValor(node);
    if (valor == null || valor === '') continue;
    if (!allowed.includes(valor)) problems.push(`${path}:${valor}`);
  }
  const duration = leafValor(card?.servicio?.duracion_habitual);
  if (duration != null && ![4, 6, 8, '4', '6', '8'].includes(duration)) {
    problems.push(`servicio.duracion_habitual:${duration}`);
  }
  return problems;
}

export function blockedFieldViolations(current, diff, path = '') {
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return [];
  const violations = [];
  for (const [key, value] of Object.entries(diff)) {
    const next = path ? `${path}.${key}` : key;
    const existing = current?.[key];
    const existingValor = leafValor(existing);
    const nextValor = leafValor(value);
    if (existing?.bloqueado === true && nextValor !== undefined && nextValor !== existingValor) {
      violations.push(next);
      continue;
    }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      violations.push(...blockedFieldViolations(existing, value, next));
    }
  }
  return violations;
}

export function copiesLiveFacts(card, appointments) {
  const text = JSON.stringify(card ?? {});
  return (appointments ?? []).some((appointment) => {
    const when = appointment.scheduledDate ? String(appointment.scheduledDate) : '';
    const price = appointment.price != null ? String(appointment.price) : '';
    return (when && text.includes(when)) || (price && price.length >= 4 && text.includes(price));
  });
}

export function hasHealthData(card) {
  return HEALTH.test(JSON.stringify(card ?? {}));
}

export function sinCampoCandidates(cards) {
  const counts = new Map();
  for (const card of cards) {
    const items = Array.isArray(card?.sin_campo) ? card.sin_campo : [];
    for (const item of items) {
      const text = typeof item === 'string' ? item : String(item?.valor ?? item?.tipo ?? '');
      const type = text.toLowerCase().split(/\s+/).slice(0, 3).join(' ').trim();
      if (!type) continue;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 5)
    .map(([tipo, fichas]) => ({ tipo, fichas }));
}

export function applyCardDiff(current, diff) {
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return current ?? {};
  const base = current && typeof current === 'object' ? structuredClone(current) : {};
  for (const [key, value] of Object.entries(diff)) {
    const existing = base[key];
    if (existing?.bloqueado === true && leafValor(value) !== undefined) continue;
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      leafValor(value) === undefined
    ) {
      base[key] = applyCardDiff(existing, value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

export function evaluateMold(input) {
  const reviewedPhones = new Set((input.reviews ?? []).map((review) => review.phone));
  const errorPhones = new Set(
    (input.reviews ?? []).filter((review) => review.verdict === 'error').map((review) => review.phone),
  );
  const reviewed = reviewedPhones.size;
  const correctionRate = reviewed === 0 ? null : errorPhones.size / reviewed;
  return {
    automaticPass: input.closedProblems === 0 && input.copied === 0 && input.health === 0 && input.blocked === 0,
    humanPass: reviewed >= 20 && correctionRate != null && correctionRate < 0.1,
    reviewed,
    correctionRate,
    candidates: input.candidates ?? [],
  };
}
