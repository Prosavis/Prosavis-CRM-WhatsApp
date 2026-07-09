/**
 * Categorías fijas del inbox WhatsApp (sidebar).
 * Las categorías de negocio se resuelven por nombre de tag (aliases, case-insensitive).
 */

export type InboxCategoryId =
  | 'last24h'
  | 'all'
  | 'unread'
  | 'archived'
  | 'agendados'
  | 'fuera_cobertura'
  | 'trabajo';

/** Categorías cuyo filtro es “tiene alguno de estos tags”. */
export type InboxTagCategoryId = 'agendados' | 'fuera_cobertura' | 'trabajo';

export const INBOX_TAG_CATEGORY_IDS: InboxTagCategoryId[] = [
  'agendados',
  'fuera_cobertura',
  'trabajo',
];

/**
 * Nombres de tag aceptados por defecto (normalizados: trim + lower + espacios colapsados).
 * `fuera_cobertura` también se puede ampliar/reemplazar vía `whatsapp_inbox_category_settings`.
 */
export const INBOX_CATEGORY_TAG_ALIASES: Record<InboxTagCategoryId, readonly string[]> = {
  agendados: ['agendado', 'agendados'],
  fuera_cobertura: [
    'fuera de cobertura',
    'bogotá',
    'bogota',
    'quindío',
    'quindio',
    'armenia',
    'cartago',
    'santa rosa',
  ],
  trabajo: ['marian', 'job', 'jobs', 'trabajo / cv', 'trabajo/cv', 'trabajo'],
};

/** Categorías cuya lista de tags se puede editar en UI (compartida en Supabase). */
export const CONFIGURABLE_INBOX_TAG_CATEGORIES: readonly InboxTagCategoryId[] = [
  'fuera_cobertura',
];

export const INBOX_CATEGORY_SETTINGS_KEY = 'fuera_cobertura' as const;

export interface InboxCategoryDefinition {
  id: InboxCategoryId;
  label: string;
  /** Texto corto para sidebar colapsada (tooltip / aria). */
  shortLabel: string;
  description: string;
}

export const INBOX_CATEGORIES: readonly InboxCategoryDefinition[] = [
  {
    id: 'last24h',
    label: 'Últimas 24 horas',
    shortLabel: '24h',
    description: 'Actividad reciente en la ventana móvil de 24 horas',
  },
  {
    id: 'all',
    label: 'Todos',
    shortLabel: 'Todos',
    description: 'Todas las conversaciones activas (no archivadas)',
  },
  {
    id: 'unread',
    label: 'No leídos',
    shortLabel: 'No leídos',
    description: 'Conversaciones con mensajes sin leer o marcadas como no leídas',
  },
  {
    id: 'archived',
    label: 'Archivados',
    shortLabel: 'Archivo',
    description: 'Conversaciones archivadas',
  },
  {
    id: 'agendados',
    label: 'Agendados',
    shortLabel: 'Agenda',
    description: 'Chats con tag Agendado',
  },
  {
    id: 'fuera_cobertura',
    label: 'Fuera de cobertura',
    shortLabel: 'Cobertura',
    description: 'Ciudades/localidades sin cobertura (tags configurables)',
  },
  {
    id: 'trabajo',
    label: 'Trabajo / CV',
    shortLabel: 'Trabajo',
    description: 'Chats con tags Marian o Job',
  },
] as const;

export const VALID_INBOX_CATEGORIES: readonly InboxCategoryId[] = INBOX_CATEGORIES.map((c) => c.id);

export const INBOX_FILTER_STORAGE_KEY = 'whatsapp-inbox-filter';
export const INBOX_SIDEBAR_COLLAPSED_KEY = 'whatsapp-inbox-sidebar-collapsed';

export function normalizeInboxTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isInboxTagCategoryId(id: InboxCategoryId): id is InboxTagCategoryId {
  return (INBOX_TAG_CATEGORY_IDS as string[]).includes(id);
}

export function getInboxCategoryDefinition(id: InboxCategoryId): InboxCategoryDefinition {
  const found = INBOX_CATEGORIES.find((c) => c.id === id);
  return found ?? INBOX_CATEGORIES[0];
}
