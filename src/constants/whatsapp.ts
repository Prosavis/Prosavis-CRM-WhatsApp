export const WHATSAPP_CRM_PHONE_NUMBER_ID = 'demo-phone-number-id';

export const WHATSAPP_TAG_PRESET_COLORS = [
  '#00a884',
  '#128c7e',
  '#34b7f1',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#64748b',
] as const;

export const WHATSAPP_STATUS_LABELS: Record<string, string> = {
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leido',
  failed: 'Fallido',
  received: 'Recibido',
};

export const WHATSAPP_CAMPAIGN_LABELS: Record<string, string> = {
  OTHER: 'General',
  REBOOKING: 'Rebooking',
  FOLLOW_UP: 'Seguimiento',
};
