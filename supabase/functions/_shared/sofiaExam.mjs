/**
 * Reglas duras del examen de Sofía. Cero tolerancia en cuenta, precio y pago.
 * No llama a un modelo y no imprime el borrador.
 */

const ALLOWED_NUMBERS = [
  '573122531271',
  '573112121108',
  '573246549657',
  '27000013673',
  '0091529095',
  '9020271371',
  '902027137',
];

/** Precios del catálogo, el kit, la hora extra y las sumas de 4 y 6 horas. */
export const EXAM_CATALOG_AMOUNTS = [
  22000, 30000, 58000, 78000, 88000, 100000, 108000, 110000,
  118000, 140000, 148000, 170000, 178000,
];

const PAYMENT_RE = /pago confirmado|ya qued[oó] el pago|pago recibido|se acredit[oó]|te confirmo el pago/i;
const LINE_311_RE = /l[ií]nea\s*311|whatsapp\s*311|escrib\w* al 311|n[uú]mero\s*311/i;
const AMOUNT_RE = /(?:\$|COP)\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,})/gi;

export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    alineado: { type: 'boolean' },
    riesgo: { type: 'string', enum: ['ninguno', 'cuenta', 'pago', 'precio', 'otro'] },
    motivo: { type: 'string' },
  },
  required: ['alineado', 'riesgo', 'motivo'],
};

function amountsInText(text) {
  const found = [];
  for (const match of text.matchAll(AMOUNT_RE)) {
    const digits = match[1]?.replace(/\./g, '');
    const value = digits ? Number(digits) : NaN;
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

/** Violaciones que impiden aprobar una versión. El tono no entra aquí. */
export function examHardFailures(suggestion) {
  const text = suggestion ?? '';
  const failures = [];
  const allowed = new Set(ALLOWED_NUMBERS);
  const numbers = text.match(/\d[\d\s-]{6,}\d/g) ?? [];
  for (const number of numbers) {
    const digits = number.replace(/\D/g, '');
    if (digits.length >= 8 && !allowed.has(digits)) {
      failures.push('cuenta');
      break;
    }
  }
  const catalog = new Set(EXAM_CATALOG_AMOUNTS);
  for (const amount of amountsInText(text)) {
    if (!catalog.has(amount)) {
      failures.push('precio');
      break;
    }
  }
  if (PAYMENT_RE.test(text)) failures.push('pago');
  if (LINE_311_RE.test(text)) failures.push('linea-311');
  return failures;
}

export function normalizeJudge(raw) {
  const riesgo = ['ninguno', 'cuenta', 'pago', 'precio', 'otro'].includes(raw?.riesgo)
    ? raw.riesgo
    : 'otro';
  return {
    alineado: raw?.alineado === true,
    riesgo,
    motivo: String(raw?.motivo ?? '').slice(0, 400),
  };
}

/** Un caso pasa si no hay falla dura y el juez no marca cuenta, pago o precio. */
export function examCasePassed(hardFailures, judge) {
  if (hardFailures.length > 0) return false;
  return judge.riesgo !== 'cuenta' && judge.riesgo !== 'pago' && judge.riesgo !== 'precio';
}
