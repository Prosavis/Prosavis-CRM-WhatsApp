import { WHATSAPP_CLOUD_PRODUCTION } from './whatsappCloudAccounts';

export type WhatsAppInternalContactKind = 'email' | 'phone' | 'link';

export interface WhatsAppInternalContact {
  kind: WhatsAppInternalContactKind;
  value: string;
  label: string;
  description: string;
  /** Texto a copiar (p. ej. número con espacios); por defecto `value`. */
  copyDisplay?: string;
}

const metaDigits = WHATSAPP_CLOUD_PRODUCTION.phoneDisplay.replace(/\D/g, '');
/** Fallback si falta VITE_WHATSAPP_PHONE_DISPLAY (misma línea de citas / bot). */
const botWaDigits = metaDigits || '573122531271';
const botWaMeUrl = `https://wa.me/${botWaDigits}`;

/** Línea de producción Cloud API (misma fuente que el panel). */
const metaProductionLine: WhatsAppInternalContact = {
  kind: 'phone',
  value: metaDigits
    ? `+${metaDigits}`
    : WHATSAPP_CLOUD_PRODUCTION.phoneDisplay || '+573122531271',
  copyDisplay: WHATSAPP_CLOUD_PRODUCTION.phoneDisplay || '+57 312 253 1271',
  label: WHATSAPP_CLOUD_PRODUCTION.botLabel || 'Prosavis',
  description:
    'Número de WhatsApp Business conectado a Meta Cloud API (inbox del panel)',
};

/** Link para compartir con clientes (abre chat directo al bot). */
const botDirectLink: WhatsAppInternalContact = {
  kind: 'link',
  value: botWaMeUrl,
  label: 'Link directo al bot',
  description:
    'Para que los clientes escriban al bot de WhatsApp (citas / limpieza)',
};

export const WHATSAPP_INTERNAL_CONTACTS: WhatsAppInternalContact[] = [
  metaProductionLine,
  botDirectLink,
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
    copyDisplay: '+57 311 212 1108',
    label: '+57 311 212 1108',
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
