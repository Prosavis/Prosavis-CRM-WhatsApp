import type { FetchConversationsOptions } from '@/services/whatsappService';

export const inboxQueryKeys = {
  all: ['inbox'] as const,
  conversations: (phoneNumberId?: string, options?: FetchConversationsOptions) =>
    ['inbox', 'conversations', phoneNumberId ?? 'all', options?.includeOrphans !== false] as const,
  messages: (stableKey: string) => ['inbox', 'messages', stableKey] as const,
  directoryMeta: (signature: string) => ['inbox', 'directory-meta', signature] as const,
  metrics: (days: number | 'all', phoneNumberId?: string) =>
    ['whatsapp-metrics', days, phoneNumberId ?? 'all'] as const,
  metricsLogs: (days: number | 'all', phoneNumberId?: string) =>
    ['whatsapp-metrics-logs', days, phoneNumberId ?? 'all'] as const,
  qualityMetrics: (from: string | null, to: string | null) =>
    ['client-quality-metrics', from ?? 'all', to ?? 'all'] as const,
  appointmentHeatmap: (filters: {
    source: string;
    status: string;
    layer: string;
    from: string | null;
    to: string | null;
  }) => ['appointment-heatmap', filters] as const,
  directoryEntries: (filters: unknown) => ['directory', 'entries', filters] as const,
  directoryStats: ['directory', 'stats'] as const,
};
