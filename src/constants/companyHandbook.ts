import {
  WHATSAPP_BOT_PHONE_DISPLAY,
  WHATSAPP_COMMERCIAL_PHONE_DISPLAY,
} from '@/utils/whatsappInboxNav';

export const HANDBOOK_CHAPTER_IDS = [
  'whatsapp',
  'emails',
  'web',
  'social',
  'house',
] as const;

export type HandbookChapterId = (typeof HANDBOOK_CHAPTER_IDS)[number];
export type HandbookEntryKind = 'phone' | 'email' | 'link' | 'text';

export interface HandbookEntry {
  id: string;
  label: string;
  description: string;
  copyText: string;
  kind: HandbookEntryKind;
  openUrl?: string;
  /** wa.me u otra URL para el segundo botón Copiar link. */
  linkCopyText?: string;
  handle?: string;
  iconSrc?: string;
}

export interface HandbookChapter {
  id: HandbookChapterId;
  title: string;
  summary: string;
  entries: HandbookEntry[];
}

const SUPPORT_PHONE_DISPLAY = '+57 324 654 9657';
const BOT_DIGITS = WHATSAPP_BOT_PHONE_DISPLAY.replace(/\D/g, '') || '573122531271';
const COMMERCIAL_DIGITS = WHATSAPP_COMMERCIAL_PHONE_DISPLAY.replace(/\D/g, '') || '573112121108';
const SUPPORT_DIGITS = '573246549657';

export function getCompanyHandbookChapters(): HandbookChapter[] {
  return [
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      summary: 'Líneas para vender y dar soporte.',
      entries: [
        {
          id: 'wa-bot',
          label: 'Bot',
          description: 'Inbox Bot. Número Cloud API.',
          copyText: WHATSAPP_BOT_PHONE_DISPLAY,
          linkCopyText: `https://wa.me/${BOT_DIGITS}`,
          kind: 'phone',
          openUrl: `https://wa.me/${BOT_DIGITS}`,
        },
        {
          id: 'wa-commercial',
          label: 'Comercial',
          description: 'Francy / Inbox Comercial.',
          copyText: WHATSAPP_COMMERCIAL_PHONE_DISPLAY,
          linkCopyText: `https://wa.me/${COMMERCIAL_DIGITS}`,
          kind: 'phone',
          openUrl: `https://wa.me/${COMMERCIAL_DIGITS}`,
        },
        {
          id: 'wa-support',
          label: 'Soporte',
          description: 'Línea de soporte de la app.',
          copyText: SUPPORT_PHONE_DISPLAY,
          linkCopyText: `https://wa.me/${SUPPORT_DIGITS}`,
          kind: 'phone',
          openUrl: `https://wa.me/${SUPPORT_DIGITS}`,
        },
      ],
    },
    {
      id: 'emails',
      title: 'Correos',
      summary: 'Bandejas oficiales para pegar en un chat.',
      entries: [
        {
          id: 'email-comercial',
          label: 'Comercial',
          description: 'Limpieza y propuestas.',
          copyText: 'comercial@prosavis.com',
          kind: 'email',
        },
        {
          id: 'email-support',
          label: 'Soporte',
          description: 'Correo de soporte (support@).',
          copyText: 'support@prosavis.com',
          kind: 'email',
        },
      ],
    },
    {
      id: 'web',
      title: 'Sitio y app',
      summary: 'Web, limpieza y tiendas.',
      entries: [
        {
          id: 'web-main',
          label: 'Web',
          description: 'prosavis.com',
          copyText: 'https://prosavis.com',
          kind: 'link',
          openUrl: 'https://prosavis.com',
        },
        {
          id: 'web-limpieza',
          label: 'Limpieza',
          description: 'Landing de limpieza.',
          copyText: 'https://prosavis.com/limpieza',
          kind: 'link',
          openUrl: 'https://prosavis.com/limpieza',
        },
        {
          id: 'web-play',
          label: 'Google Play',
          description: 'App Android.',
          copyText: 'https://play.google.com/store/apps/details?id=com.prosavis.app',
          kind: 'link',
          openUrl: 'https://play.google.com/store/apps/details?id=com.prosavis.app&hl=es_CO',
        },
        {
          id: 'web-appstore',
          label: 'App Store',
          description: 'App iOS.',
          copyText: 'https://apps.apple.com/co/app/prosavis/id6754036487',
          kind: 'link',
          openUrl: 'https://apps.apple.com/co/app/prosavis/id6754036487',
        },
      ],
    },
    {
      id: 'social',
      title: 'Redes',
      summary: 'Handles y URLs para copiar al cliente.',
      entries: [
        {
          id: 'social-ig',
          label: 'Instagram',
          description: '@prosavis.app',
          handle: '@prosavis.app',
          copyText: 'https://www.instagram.com/prosavis.app/',
          kind: 'link',
          openUrl: 'https://www.instagram.com/prosavis.app/',
          iconSrc: '/icons/social/instagram.webp',
        },
        {
          id: 'social-tt',
          label: 'TikTok',
          description: '@prosavis',
          handle: '@prosavis',
          copyText: 'https://tiktok.com/@prosavis',
          kind: 'link',
          openUrl: 'https://tiktok.com/@prosavis',
          iconSrc: '/icons/social/tiktok.png',
        },
        {
          id: 'social-fb',
          label: 'Facebook',
          description: 'Prosavis',
          handle: 'Prosavis',
          copyText: 'https://www.facebook.com/profile.php?id=61581754336778',
          kind: 'link',
          openUrl: 'https://www.facebook.com/profile.php?id=61581754336778',
          iconSrc: '/icons/social/facebook.png',
        },
        {
          id: 'social-x',
          label: 'X',
          description: '@prosavis',
          handle: '@prosavis',
          copyText: 'https://x.com/prosavis',
          kind: 'link',
          openUrl: 'https://x.com/prosavis',
          iconSrc: '/icons/social/x.png',
        },
        {
          id: 'social-yt',
          label: 'YouTube',
          description: '@Prosavis8',
          handle: '@Prosavis8',
          copyText: 'https://www.youtube.com/@Prosavis8',
          kind: 'link',
          openUrl: 'https://www.youtube.com/@Prosavis8',
          iconSrc: '/icons/social/Youtube_logo.png',
        },
        {
          id: 'social-li',
          label: 'LinkedIn',
          description: 'company/prosavis',
          handle: 'company/prosavis',
          copyText: 'https://www.linkedin.com/company/prosavis',
          kind: 'link',
          openUrl: 'https://www.linkedin.com/company/prosavis',
          iconSrc: '/icons/social/LinkedIn.png',
        },
      ],
    },
    {
      id: 'house',
      title: 'Datos de la casa',
      summary: 'Razón social, NIT y dirección.',
      entries: [
        {
          id: 'house-legal',
          label: 'Razón social',
          description: 'Nombre legal.',
          copyText: 'PROSAVIS SAS',
          kind: 'text',
        },
        {
          id: 'house-nit',
          label: 'NIT',
          description: 'Identificación tributaria.',
          copyText: '902027137-1',
          kind: 'text',
        },
        {
          id: 'house-address',
          label: 'Dirección',
          description: 'Pereira, Risaralda.',
          copyText: 'Cra. 23 #85-13 Manzana 5 Casa 17, Pereira, Risaralda, Colombia',
          kind: 'text',
        },
        {
          id: 'house-maps',
          label: 'Google Maps',
          description: 'Prosavis Limpieza.',
          copyText: 'https://maps.app.goo.gl/xnKEMBYy6T3KuCAL8',
          kind: 'link',
          openUrl: 'https://maps.app.goo.gl/xnKEMBYy6T3KuCAL8',
        },
      ],
    },
  ];
}

export function getHandbookChapter(id: HandbookChapterId): HandbookChapter | undefined {
  return getCompanyHandbookChapters().find((chapter) => chapter.id === id);
}

export function isHandbookChapterId(value: string): value is HandbookChapterId {
  return (HANDBOOK_CHAPTER_IDS as readonly string[]).includes(value);
}
