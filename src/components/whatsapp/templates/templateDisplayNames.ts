const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
  cobro_servicios: 'Cobro de servicios',
  seguimiento_suave: 'Seguimiento suave',
  seguimiento_incentivo: 'Seguimiento con incentivo',
  seguimiento_final: 'Seguimiento final',
  rebooking_frecuencia: 'Recordatorio de promoción',
  react_followup_sin_respuesta_v2: 'Sin respuesta',
  react_followup_semanas_sin_contacto: 'Semanas sin contacto',
  react_followup_valor_sin_presion: 'Valor sin presión',
  react_cliente_antigua_fecha: 'Cliente con fecha antigua',
  react_cliente_hace_tiempo: 'Cliente hace tiempo',
  react_cliente_misma_profesional: 'Promoción pago anticipado',
  outreach_intro_prosavis: 'Intro Prosavis',
  outreach_invitacion_agendar: 'Invitación a agendar',
  outreach_respuesta_si_quiere_precios: 'Respuesta precios',
  welcome_greeting: 'Bienvenida',
};

export function getTemplateDisplayName(templateName: string): string {
  const mapped = TEMPLATE_DISPLAY_NAMES[templateName];
  if (mapped) return mapped;

  return templateName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
