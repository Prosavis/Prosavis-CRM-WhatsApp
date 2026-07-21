/**
 * Cadencia escalonada de reactivación (3 meses).
 * Día 0 = ingreso al programa (primer mensaje).
 */

export const REACTIVATION_SEQUENCE = 'REACTIVACION';
export const REACTIVATION_TEMPLATE_LANGUAGE = 'es_CO';
export const REACTIVATION_CAMPAIGN_TYPE = 'REACTIVATION';

export type ReactivationStepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface ReactivationStepDef {
  step: ReactivationStepNumber;
  /** Días desde el envío anterior (gaps relativos). Paso 1 = 0 (inmediato). */
  gapDaysFromPrevious: number;
  /** Días acumulados desde el ingreso si se envía a tiempo. */
  dayFromEnrollment: number;
  templateName: string;
  /** Parámetros de body además de {{1}}=nombre. */
  extraBodyParams?: string[];
  label: string;
}

export const REACTIVATION_STEPS: ReactivationStepDef[] = [
  {
    step: 1,
    gapDaysFromPrevious: 0,
    dayFromEnrollment: 0,
    templateName: 'react_reagendar_suave',
    label: 'Suave — reagendar',
  },
  {
    step: 2,
    gapDaysFromPrevious: 7,
    dayFromEnrollment: 7,
    templateName: 'rebooking_frecuencia',
    label: 'Frecuencia / valor',
  },
  {
    step: 3,
    gapDaysFromPrevious: 7,
    dayFromEnrollment: 14,
    templateName: 'react_followup_valor_sin_presion',
    label: 'Valor sin presión',
  },
  {
    step: 4,
    gapDaysFromPrevious: 14,
    dayFromEnrollment: 28,
    templateName: 'react_cliente_hace_tiempo',
    extraBodyParams: ['un mes'],
    label: 'Cierre mes 1',
  },
  {
    step: 5,
    gapDaysFromPrevious: 28,
    dayFromEnrollment: 56,
    templateName: 'react_cliente_hace_tiempo',
    extraBodyParams: ['casi dos meses'],
    label: 'Check-in mes 2',
  },
  {
    step: 6,
    gapDaysFromPrevious: 28,
    dayFromEnrollment: 84,
    templateName: 'seguimiento_final',
    label: 'Último toque mes 3',
  },
];

export function getStepDef(step: number): ReactivationStepDef | null {
  return REACTIVATION_STEPS.find((s) => s.step === step) ?? null;
}

export function nextStepNumber(currentStep: number): ReactivationStepNumber | null {
  if (currentStep < 1) return 1;
  if (currentStep >= 6) return null;
  return (currentStep + 1) as ReactivationStepNumber;
}

export function daysSinceIso(iso: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((asOf.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Determina el siguiente paso a enviar.
 * - sequence_step = último paso enviado (0 = no inscrito).
 * - El gap se mide desde last_contact_at (último envío).
 */
export function resolveDueStep(params: {
  sequenceStep: number;
  lastContactAt: string | null;
  asOf?: Date;
}): ReactivationStepNumber | null {
  const asOf = params.asOf ?? new Date();
  const next = nextStepNumber(params.sequenceStep);
  if (!next) return null;

  const def = getStepDef(next);
  if (!def) return null;

  if (next === 1) return 1;

  const days = daysSinceIso(params.lastContactAt, asOf);
  if (days == null) return next; // sin last_contact: permitir avanzar
  if (days >= def.gapDaysFromPrevious) return next;
  return null;
}

export function buildTemplateComponents(
  clientName: string,
  step: ReactivationStepDef,
): Array<Record<string, unknown>> {
  const params = [
    { type: 'text', text: clientName },
    ...(step.extraBodyParams ?? []).map((text) => ({ type: 'text', text })),
  ];
  return [
    {
      type: 'body',
      parameters: params,
    },
  ];
}

export function buildDisplayBody(clientName: string, step: ReactivationStepDef): string {
  switch (step.templateName) {
    case 'react_reagendar_suave':
      return `Hola ${clientName} 👋 Estamos aquí por si quieres reagendar tu cita de limpieza o agendar otra pronto. Cuando quieras, responde y te ayudamos con disponibilidad.`;
    case 'rebooking_frecuencia':
      return `Hola ${clientName}, muchos de nuestros clientes agendan cada 2 semanas para mantener su hogar siempre limpio sin esfuerzo. ¿Te gustaría que te agendemos un servicio recurrente? Te garantizamos la misma profesional cada vez 🏠`;
    case 'react_followup_valor_sin_presion':
      return `Hola ${clientName}, solo queríamos recordarte que en Prosavis trabajamos con personal verificado, pago seguro y seguimiento del servicio. Cuando quieras retomar tu limpieza, aquí estamos.`;
    case 'react_cliente_hace_tiempo': {
      const when = step.extraBodyParams?.[0] ?? 'un tiempo';
      return `Hola ${clientName}, hace ${when} que no coordinamos limpieza contigo. Si quieres retomar, podemos ayudarte a encontrar horario y profesional disponible.`;
    }
    case 'seguimiento_final':
      return `Hola ${clientName}, solo quería dejarte saber que seguimos disponibles cuando necesites. Personal verificado, pago seguro, y verificación de identidad para tu tranquilidad. Si en algún momento necesitas, aquí estamos. ¡Que tengas buen día! 😊`;
    default:
      return `Hola ${clientName}, mensaje de reactivación Prosavis (${step.templateName}).`;
  }
}

export function isPausedForHumanReply(params: {
  lastContactAt: string | null;
  lastResponseAt: string | null;
}): boolean {
  if (!params.lastResponseAt || !params.lastContactAt) return false;
  return new Date(params.lastResponseAt).getTime() > new Date(params.lastContactAt).getTime();
}
