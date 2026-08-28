import type { FetchConversationsOptions } from '@/services/whatsappService';

export const inboxQueryKeys = {
  all: ['inbox'] as const,
  conversations: (phoneNumberId?: string, options?: FetchConversationsOptions) =>
    ['inbox', 'conversations', phoneNumberId ?? 'all', options?.includeOrphans !== false] as const,
  messages: (stableKey: string) => ['inbox', 'messages', stableKey] as const,
  directoryMeta: (signature: string) => ['inbox', 'directory-meta', signature] as const,
  metrics: (days: number, phoneNumberId?: string) =>
    ['whatsapp-metrics', days, phoneNumberId ?? 'all'] as const,
  metricsLogs: (days: number, phoneNumberId?: string) =>
    ['whatsapp-metrics-logs', days, phoneNumberId ?? 'all'] as const,
  directoryEntries: (filters: unknown) => ['directory', 'entries', filters] as const,
  directoryStats: ['directory', 'stats'] as const,
};
