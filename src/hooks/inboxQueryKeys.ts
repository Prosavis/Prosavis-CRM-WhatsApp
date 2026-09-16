import type { FetchConversationsOptions } from '@/services/whatsappService';

export const inboxQueryKeys = {
  all: ['inbox'] as const,
  conversations: (phoneNumberId?: string, options?: FetchConversationsOptions) =>
    ['inbox', 'conversations', phoneNumberId ?? 'all', options?.includeOrphans !== false] as const,
  messages: (stableKey: string) => ['inbox', 'messages', stableKey] as const,
  directoryMeta: (signature: string) => ['inbox', 'directory-meta', signature] as const,
  metrics: (phoneNumberId?: string, serviceId?: string) =>
    ['whatsapp-metrics', phoneNumberId ?? 'all', serviceId ?? 'default'] as const,
  appMetrics: (serviceId?: string) =>
    ['app-metrics', serviceId ?? 'default'] as const,
  metricsLogs: (phoneNumberId?: string) =>
    ['whatsapp-metrics-logs', phoneNumberId ?? 'all'] as const,
  directoryMetrics: (serviceId?: string) =>
    ['directory-metrics', serviceId ?? 'default'] as const,
  completedAppointments: (serviceId?: string) =>
    ['completed-appointments', serviceId ?? 'default'] as const,
  appointmentMetrics: (
    serviceId?: string,
    from?: string | null,
    to?: string | null,
    statuses?: string[] | null,
  ) =>
    ['appointment-metrics', serviceId ?? 'default', from ?? 'all', to ?? 'all', statuses ?? []] as const,
  qualityMetrics: (serviceId?: string) =>
    ['client-quality-metrics', serviceId ?? 'default'] as const,
  appointmentHeatmap: (filters: {
    source: string;
    status: string;
    layer: string;
    serviceId?: string;
  }) => ['appointment-heatmap', filters] as const,
  directoryEntries: (filters: unknown) => ['directory', 'entries', filters] as const,
  directoryStats: ['directory', 'stats'] as const,
  directoryWorkspaceRoot: () => ['directory-workspace'] as const,
  directoryWorkspaceSummary: (serviceId?: string) =>
    ['directory-workspace', 'summary', serviceId ?? 'default'] as const,
  directoryWorkspacePage: (
    serviceId: string,
    view: string,
    search: string,
    segment: string | null,
    limit: number,
    offset: number,
  ) =>
    ['directory-workspace', 'page', serviceId, view, search, segment, limit, offset] as const,
  directoryWorkspaceCancellations: (serviceId: string, directoryId: string) =>
    ['directory-workspace', 'cancellations', serviceId, directoryId] as const,
};
