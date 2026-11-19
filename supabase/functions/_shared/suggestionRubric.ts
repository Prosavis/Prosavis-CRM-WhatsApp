export interface SuggestionRuleInput {
  suggestion: string;
  forbiddenNames?: string[];
  catalogAmounts?: number[];
  allowedSlots?: string[];
  /** Cuentas y teléfonos que sí se pueden mencionar. Si se pasa, cualquier otro número largo es violación. */
  allowedAccounts?: string[];
}

const MAX_BUBBLE_CHARS = 200;
const TU_RE = /(^|[\s,.;:¿¡])(te|tu|tus|ti|contigo)(?=$|[\s,.;:?!])/i;

export interface SuggestionRuleScore {
  violations: string[];
  passed: boolean;
  /** 0 si hay una violación de regla fija; 5 si el texto las cumple. */
  score: number;
}

function mentionsKit(text: string): boolean {
  return /kit/i.test(text);
}

function amountsInText(text: string): number[] {
  const found: number[] = [];
  const pattern = /(?:\$|COP)\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,})/gi;
  for (const match of text.matchAll(pattern)) {
    const digits = match[1]?.replace(/\./g, '');
    const value = digits ? Number(digits) : NaN;
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

/**
 * Chequeos deterministas de las reglas fijas.
 * Tono, fidelidad del pedido y acciones quedan para la rúbrica humana.
 */
export function scoreSuggestionRules(input: SuggestionRuleInput): SuggestionRuleScore {
  const text = input.suggestion ?? '';
  const violations: string[] = [];
  const folded = text.toLocaleLowerCase('es');

  if (mentionsKit(text) && !text.includes('Kit de limpieza Prosavis')) {
    violations.push('kit');
  }
  if (/kit profesional|pro service/i.test(text)) {
    violations.push('kit-nombre');
  }
  if (/la misma auxiliar|misma auxiliar|misma persona que la vez/i.test(folded)) {
    violations.push('misma-auxiliar');
  }
  for (const name of input.forbiddenNames ?? []) {
    const trimmed = name.trim();
    if (trimmed.length >= 3 && folded.includes(trimmed.toLocaleLowerCase('es'))) {
      violations.push('auxiliar');
      break;
    }
  }
  if (/8 horas/i.test(folded) && /hora adicional/i.test(folded)) {
    violations.push('hora-adicional');
  }
  const bubbles = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (bubbles.length > 2 || bubbles.some((bubble) => bubble.length > MAX_BUBBLE_CHARS)) {
    violations.push('largo');
  }
  const questions = text.match(/\?/g) ?? [];
  if (questions.length > 1) violations.push('preguntas');
  if (TU_RE.test(text)) violations.push('tuteo');
  if (input.allowedAccounts) {
    const allowed = new Set(input.allowedAccounts.map((account) => account.replace(/\D/g, '')));
    const numbers = text.match(/\d[\d\s-]{6,}\d/g) ?? [];
    for (const number of numbers) {
      const digits = number.replace(/\D/g, '');
      if (digits.length >= 8 && !allowed.has(digits)) {
        violations.push('cuenta');
        break;
      }
    }
  }
  const catalog = new Set(input.catalogAmounts ?? []);
  if (catalog.size > 0) {
    for (const amount of amountsInText(text)) {
      if (!catalog.has(amount)) {
        violations.push('precio');
        break;
      }
    }
  }
  if ((input.allowedSlots ?? []).length > 0) {
    const hours = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) ?? [];
    const allowedHours = new Set(
      (input.allowedSlots ?? []).map((slot) => {
        const date = new Date(slot);
        if (!Number.isFinite(date.getTime())) return '';
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Bogota',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(date);
      }),
    );
    for (const hour of hours) {
      const normalized = hour.padStart(5, '0');
      if (!allowedHours.has(normalized)) {
        violations.push('horario');
        break;
      }
    }
  }

  const passed = violations.length === 0;
  return { violations, passed, score: passed ? 5 : 0 };
}
