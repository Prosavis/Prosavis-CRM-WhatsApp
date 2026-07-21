export type WhatsAppTemplatePanelSection =
  | 'utility'
  | 'marketing'
  | 'seasonal'
  | 'reactivation'
  | 'cold_outreach';

export interface WhatsAppTemplateSectionMeta {
  key: WhatsAppTemplatePanelSection;
  label: string;
  description: string;
  order: number;
}

export const WHATSAPP_TEMPLATE_SECTIONS: WhatsAppTemplateSectionMeta[] = [
  {
    key: 'utility',
    label: 'Utilidad',
    description: 'Actualizaciones transaccionales, citas y soporte operativo.',
    order: 1,
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Promos, contenido de valor y campañas generales.',
    order: 2,
  },
  {
    key: 'seasonal',
    label: 'Ocasiones especiales',
    description: 'Festivos, saludos de temporada y recordatorios con contexto local.',
    order: 3,
  },
  {
    key: 'reactivation',
    label: 'Reactivación',
    description: 'Contactos enfriados y clientes que ya habían agendado.',
    order: 4,
  },
  {
    key: 'cold_outreach',
    label: 'Activación manual',
    description: 'Primer contacto autorizado con números nuevos o listas operativas.',
    order: 5,
  },
];

const TEMPLATE_SECTION_BY_NAME: Record<string, WhatsAppTemplatePanelSection> = {
  booking_reminder_dia_madre: 'seasonal',
  booking_reminder_dia_padre: 'seasonal',
  booking_reminder_navidad: 'seasonal',
  booking_reminder_fin_ano: 'seasonal',
  booking_reminder_amor_amistad: 'seasonal',
  festivo_horario_atencion: 'seasonal',
  util_aviso_semana_santa: 'seasonal',
  felicitacion_navidad: 'seasonal',
  felicitacion_anio_nuevo: 'seasonal',
  felicitacion_dia_velitas: 'seasonal',
  dia_madre_saludo: 'seasonal',
  dia_padre_saludo: 'seasonal',
  dia_amor_amistad_saludo: 'seasonal',
  felicitacion_independencia_co: 'seasonal',
  saludo_fin_anio_agradecimiento: 'seasonal',

  seguimiento_suave: 'reactivation',
  seguimiento_incentivo: 'reactivation',
  seguimiento_final: 'reactivation',
  rebooking_suave_v2: 'reactivation',
  rebooking_frecuencia: 'reactivation',
  react_followup_sin_respuesta_v2: 'reactivation',
  react_followup_semanas_sin_contacto: 'reactivation',
  react_followup_valor_sin_presion: 'reactivation',
  react_cliente_antigua_fecha: 'reactivation',
  react_cliente_hace_tiempo: 'reactivation',
  react_cliente_misma_profesional: 'reactivation',
  react_reagendar_suave: 'reactivation',

  outreach_intro_prosavis: 'cold_outreach',
  outreach_invitacion_agendar: 'cold_outreach',
  outreach_respuesta_si_quiere_precios: 'cold_outreach',
};

export function resolveWhatsAppTemplatePanelSection(
  templateName: string,
  metaCategory?: string,
): WhatsAppTemplatePanelSection {
  const mapped = TEMPLATE_SECTION_BY_NAME[templateName];
  if (mapped) return mapped;

  const category = (metaCategory || '').toUpperCase().trim();
  if (category === 'UTILITY' || category === 'AUTHENTICATION') return 'utility';
  return 'marketing';
}

export function getWhatsAppTemplateSectionMeta(
  section: WhatsAppTemplatePanelSection,
): WhatsAppTemplateSectionMeta {
  return WHATSAPP_TEMPLATE_SECTIONS.find((item) => item.key === section) ?? WHATSAPP_TEMPLATE_SECTIONS[1];
}

export function getWhatsAppTemplateSectionOrder(section: WhatsAppTemplatePanelSection): number {
  return getWhatsAppTemplateSectionMeta(section).order;
}
