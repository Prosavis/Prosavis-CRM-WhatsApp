import { WHATSAPP_CLOUD_PRODUCTION } from './whatsappCloudAccounts';

export type WhatsAppInternalContactKind = 'email' | 'phone';

export interface WhatsAppInternalContact {
  kind: WhatsAppInternalContactKind;
  value: string;
  label: string;
  description: string;
  /** Texto a copiar (p. ej. número con espacios); por defecto `value`. */
  copyDisplay?: string;
}

const metaDigits = WHATSAPP_CLOUD_PRODUCTION.phoneDisplay.replace(/\D/g, '');

/** Línea de producción Cloud API (misma fuente que el panel). */
const metaProductionLine: WhatsAppInternalContact = {
  kind: 'phone',
  value: metaDigits ? `+${metaDigits}` : WHATSAPP_CLOUD_PRODUCTION.phoneDisplay,
  copyDisplay: WHATSAPP_CLOUD_PRODUCTION.phoneDisplay,
  label: WHATSAPP_CLOUD_PRODUCTION.botLabel,
  description: 'Número de WhatsApp Business conectado a Meta Cloud API (inbox del panel)',
};

export const WHATSAPP_INTERNAL_CONTACTS: WhatsAppInternalContact[] = [
  metaProductionLine,
  {
    kind: 'email',
    value: 'comercial@prosavis.com',
    label: 'Comercial',
    description: 'Limpieza y propuestas',
  },
  {
    kind: 'email',
    value: 'support@prosavis.com',
    label: 'Soporte',
    description: 'Correo de soporte',
  },
  {
    kind: 'phone',
    value: '+573112121108',
    copyDisplay: '+57 311 2121108',
    label: '+57 311 2121108',
    description: 'Comercial (Francy): trabajo o propuestas a empresas',
  },
  {
    kind: 'phone',
    value: '+573246549657',
    copyDisplay: '+57 324 6549657',
    label: '+57 324 6549657',
    description: 'Soporte del aplicativo',
  },
];
