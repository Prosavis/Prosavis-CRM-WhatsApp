const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
  booking_reminder_dia_madre: 'Recordatorio Día de la Madre',
  booking_reminder_dia_padre: 'Recordatorio Día del Padre',
  booking_reminder_navidad: 'Recordatorio Navidad',
  booking_reminder_fin_ano: 'Recordatorio fin de año',
  booking_reminder_amor_amistad: 'Recordatorio Amor y Amistad',
  festivo_horario_atencion: 'Horario festivo',
  util_aviso_semana_santa: 'Aviso Semana Santa',
  felicitacion_navidad: 'Felicitación Navidad',
  felicitacion_anio_nuevo: 'Felicitación Año Nuevo',
  felicitacion_dia_velitas: 'Felicitación Día de las Velitas',
  dia_madre_saludo: 'Saludo Día de la Madre',
  dia_padre_saludo: 'Saludo Día del Padre',
  dia_amor_amistad_saludo: 'Saludo Amor y Amistad',
  felicitacion_independencia_co: 'Felicitación Independencia',
  saludo_fin_anio_agradecimiento: 'Agradecimiento fin de año',
  seguimiento_suave: 'Seguimiento suave',
  seguimiento_incentivo: 'Seguimiento con incentivo',
  seguimiento_final: 'Seguimiento final',
  rebooking_suave_v2: 'Reagendar suave',
  rebooking_frecuencia: 'Reagendar por frecuencia',
  react_followup_sin_respuesta_v2: 'Sin respuesta',
  react_followup_semanas_sin_contacto: 'Semanas sin contacto',
  react_followup_valor_sin_presion: 'Valor sin presión',
  react_cliente_antigua_fecha: 'Cliente con fecha antigua',
  react_cliente_hace_tiempo: 'Cliente hace tiempo',
  react_cliente_misma_profesional: 'Misma profesional',
  outreach_intro_prosavis: 'Intro ProSavis',
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
