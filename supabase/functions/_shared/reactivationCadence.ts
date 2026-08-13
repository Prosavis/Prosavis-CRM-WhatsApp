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
    templateName: 'react_cliente_misma_profesional',
    label: 'Promoción pago anticipado',
  },
  {
    step: 2,
    gapDaysFromPrevious: 7,
    dayFromEnrollment: 7,
    templateName: 'rebooking_frecuencia',
    label: 'Recordatorio de promoción',
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

/** Ventana Bogotá 12–31 ago 2026: reactivación en tono solidario (sin promo). */
export const SOLIDARITY_OVERRIDE_START = '2026-08-12';
export const SOLIDARITY_OVERRIDE_END = '2026-08-31';

const RETORNO_OPERACION_BODY2 =
  'ya retomamos operaciones desde el 12 de agosto y estamos listos para acompañarte';

/** Plantillas solidarias por paso mientras dure el override de agosto. */
const SOLIDARITY_STEP_TEMPLATES: Record<
  ReactivationStepNumber,
  Pick<ReactivationStepDef, 'templateName' | 'extraBodyParams' | 'label'>
> = {
  1: {
    templateName: 'contingencia_regreso_esperanza_pereira',
    label: 'Solidaridad regreso Pereira',
  },
  2: {
    templateName: 'contingencia_retorno_operacion',
    extraBodyParams: [RETORNO_OPERACION_BODY2],
    label: 'Retorno de operaciones',
  },
  3: {
    templateName: 'contingencia_apoyo_seguimiento',
    label: 'Apoyo / cómo están',
  },
  4: {
    templateName: 'contingencia_solidaridad_sismo',
    label: 'Solidaridad sismo',
  },
  5: {
    templateName: 'contingencia_apoyo_seguimiento',
    label: 'Apoyo seguimiento',
  },
  6: {
    templateName: 'contingencia_retorno_operacion',
    extraBodyParams: [RETORNO_OPERACION_BODY2],
    label: 'Cierre solidario retorno',
  },
};

export function bogotaYmd(asOf: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(asOf);
}

/** true si la fecha Bogotá cae en 12–31 ago 2026 (inclusive). */
export function isAugustSolidarityPeriod(asOf: Date = new Date()): boolean {
  const ymd = bogotaYmd(asOf);
  return ymd >= SOLIDARITY_OVERRIDE_START && ymd <= SOLIDARITY_OVERRIDE_END;
}

export function getStepDef(step: number, asOf: Date = new Date()): ReactivationStepDef | null {
  const base = REACTIVATION_STEPS.find((s) => s.step === step) ?? null;
  if (!base) return null;
  if (!isAugustSolidarityPeriod(asOf)) return base;
  const override = SOLIDARITY_STEP_TEMPLATES[base.step];
  return {
    ...base,
    templateName: override.templateName,
    extraBodyParams: override.extraBodyParams,
    label: override.label,
  };
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
    case 'react_cliente_misma_profesional':
      return `Hola ${clientName} 👋 Tenemos un beneficio especial para ti. Al agendar y pagar por anticipado un paquete de 4 servicios, uno por semana, recibes un descuento sobre el total del paquete:\n\n• 4 horas por servicio: $10.000\n• 6 horas por servicio: $15.000\n• 8 horas por servicio: $20.000\n\nEste beneficio aplica cada vez que pagues anticipadamente el paquete completo. ¿Quieres que revisemos disponibilidad?`;
    case 'rebooking_frecuencia':
      return `Hola ${clientName} 👋 Te recordamos el beneficio disponible al agendar y pagar por anticipado un paquete de 4 servicios, uno por semana. El descuento sobre el total del paquete es:\n\n• 4 horas por servicio: $10.000\n• 6 horas por servicio: $15.000\n• 8 horas por servicio: $20.000\n\nPuedes aprovecharlo cada vez que pagues anticipadamente el paquete completo. Responde y revisamos disponibilidad contigo.`;
    case 'react_followup_valor_sin_presion':
      return `Hola ${clientName}, solo queríamos recordarte que en Prosavis trabajamos con personal verificado, pago seguro y seguimiento del servicio. Cuando quieras retomar tu limpieza, aquí estamos.`;
    case 'react_cliente_hace_tiempo': {
      const when = step.extraBodyParams?.[0] ?? 'un tiempo';
      return `Hola ${clientName}, hace ${when} que no coordinamos limpieza contigo. Si quieres retomar, podemos ayudarte a encontrar horario y profesional disponible.`;
    }
    case 'seguimiento_final':
      return `Hola ${clientName}, solo quería dejarte saber que seguimos disponibles cuando necesites. Personal verificado, pago seguro, y verificación de identidad para tu tranquilidad. Si en algún momento necesitas, aquí estamos. ¡Que tengas buen día! 😊`;
    case 'contingencia_regreso_esperanza_pereira':
      return `Hola ${clientName}. Desde Prosavis queremos decirte que esperamos de corazón que tú y tu familia se encuentren bien y a salvo. Pereira y el Eje Cafetero son nuestro hogar: estamos con nuestra ciudad y listos para apoyarnos entre todos.`;
    case 'contingencia_solidaridad_sismo':
      return `Hola ${clientName}. Desde Prosavis queremos decirles que esperamos de corazón que usted y su familia se encuentren muy bien y a salvo tras el temblor. Estamos atentos a lo que necesiten. Un abrazo.`;
    case 'contingencia_apoyo_seguimiento':
      return `Hola ${clientName}. Solo queríamos saber cómo se encuentran usted y los suyos. En Prosavis seguimos a la orden si necesitan algo. Cuídese mucho.`;
    case 'contingencia_retorno_operacion': {
      const retorno = step.extraBodyParams?.[0] ?? RETORNO_OPERACION_BODY2;
      return `Hola ${clientName}. Le informamos sobre el retorno de operaciones de Prosavis: ${retorno}. Cuando desee retomar su servicio, escríbanos y coordinamos. Gracias por su comprensión.`;
    }
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

/** Estados que no tienen envío automático pendiente. */
export type ReactivationRowStatusForSend =
  | 'due'
  | 'waiting'
  | 'paused_reply'
  | 'disabled'
  | 'opt_out'
  | 'completed'
  | 'stale'
  | 'active_again'
  | 'eligible';

const NO_SEND_STATUSES: ReadonlySet<ReactivationRowStatusForSend> = new Set([
  'opt_out',
  'disabled',
  'paused_reply',
  'completed',
  'stale',
  'active_again',
]);

/**
 * Próximo cron diario 12:00 America/Bogota (UTC-5) → 17:00 UTC.
 */
export function nextSchedulerRunAt(now = new Date()): string {
  const bogotaOffsetMs = -5 * 60 * 60 * 1000;
  const bogotaNow = new Date(now.getTime() + bogotaOffsetMs);
  const y = bogotaNow.getUTCFullYear();
  const m = bogotaNow.getUTCMonth();
  const d = bogotaNow.getUTCDate();
  const hour = bogotaNow.getUTCHours();
  let targetBogota = new Date(Date.UTC(y, m, d, 12, 0, 0));
  if (hour >= 12) {
    targetBogota = new Date(Date.UTC(y, m, d + 1, 12, 0, 0));
  }
  return new Date(targetBogota.getTime() - bogotaOffsetMs).toISOString();
}

/**
 * Primer cron 12:00 CO en el que el contacto recibiría el siguiente paso
 * (misma regla que resolveDueStep). No persiste en DB.
 */
export function computeNextSendAt(params: {
  sequenceStep: number;
  lastContactAt: string | null;
  status: ReactivationRowStatusForSend;
  asOf?: Date;
}): string | null {
  const asOf = params.asOf ?? new Date();
  if (NO_SEND_STATUSES.has(params.status)) return null;

  if (params.status === 'due' || params.status === 'eligible') {
    return nextSchedulerRunAt(asOf);
  }

  if (params.status !== 'waiting') return null;

  const next = nextStepNumber(params.sequenceStep);
  if (!next) return null;

  let candidate = new Date(nextSchedulerRunAt(asOf));
  for (let i = 0; i < 90; i++) {
    const due = resolveDueStep({
      sequenceStep: params.sequenceStep,
      lastContactAt: params.lastContactAt,
      asOf: candidate,
    });
    if (due) return candidate.toISOString();
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}
