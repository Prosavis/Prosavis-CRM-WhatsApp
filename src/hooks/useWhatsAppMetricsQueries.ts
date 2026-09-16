import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { PROSAVIS_CLEANING_SERVICE_ID } from '@/constants/cleaningService';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import {
  getAppMetrics,
  getAppointmentHeatmap,
  getClientQualityMetrics,
  getWhatsAppMetrics,
  listAppointmentMetrics,
  listWhatsAppMessageLog,
} from '@/services/whatsappService';
import type { AppMetricsSnapshot } from '@/types/whatsapp';
import type { MetricsVista } from '@/utils/metricsVistas';

export function vistaNeedsQuality(vista: MetricsVista): boolean {
  return vista === 'calidad' || vista === 'friccion';
}

export function vistaNeedsHeatmap(vista: MetricsVista): boolean {
  return vista === 'mapa';
}

interface UseWhatsAppMetricsQueriesInput {
  vista: MetricsVista;
  phoneNumberId: string;
  heatmap: {
    preferGps: boolean;
    status: string;
    layer: string;
  };
}

export function useWhatsAppMetricsQueries(input: UseWhatsAppMetricsQueriesInput) {
  const serviceId = PROSAVIS_CLEANING_SERVICE_ID;
  const heatmapSource = input.heatmap.preferGps ? 'gps' : 'address';

  const metricsQuery = useQuery({
    queryKey: inboxQueryKeys.metrics(input.phoneNumberId, serviceId),
    queryFn: () => getWhatsAppMetrics('all', input.phoneNumberId, serviceId),
    staleTime: 60_000,
  });

  const appQuery = useQuery({
    queryKey: inboxQueryKeys.appMetrics(serviceId),
    queryFn: () => getAppMetrics(serviceId) as Promise<AppMetricsSnapshot>,
    staleTime: 60_000,
  });

  const qualityQuery = useQuery({
    queryKey: inboxQueryKeys.qualityMetrics(serviceId),
    queryFn: () => getClientQualityMetrics({
      serviceId,
      mode: 'detail',
    }),
    staleTime: 60_000,
    enabled: vistaNeedsQuality(input.vista),
  });

  const heatmapQuery = useQuery({
    queryKey: inboxQueryKeys.appointmentHeatmap({
      source: heatmapSource,
      status: input.heatmap.status,
      layer: input.heatmap.layer,
      serviceId,
    }),
    queryFn: () =>
      getAppointmentHeatmap({
        source: heatmapSource,
        status: input.heatmap.status,
        layer: input.heatmap.layer,
        serviceId,
        mode: 'detail',
      }),
    staleTime: 60_000,
    enabled: vistaNeedsHeatmap(input.vista),
  });

  const logsQuery = useQuery({
    queryKey: inboxQueryKeys.metricsLogs(input.phoneNumberId),
    queryFn: () => listWhatsAppMessageLog({
      days: 'all',
      phoneNumberId: input.phoneNumberId,
      limit: 200,
    }),
    staleTime: 30_000,
    enabled: input.vista === 'outbound',
  });

  return {
    metricsQuery,
    appQuery,
    qualityQuery,
    heatmapQuery,
    logsQuery,
  };
}

export function useAppointmentMetricsInfiniteQuery(input: {
  serviceId: string;
  enabled: boolean;
  from: string | null;
  to: string | null;
  statuses?: string[] | null;
}) {
  return useInfiniteQuery({
    queryKey: inboxQueryKeys.appointmentMetrics(
      input.serviceId,
      input.from,
      input.to,
      input.statuses,
    ),
    queryFn: async ({ pageParam }) => {
      const page = await listAppointmentMetrics({
        serviceId: input.serviceId,
        from: input.from,
        to: input.to,
        statuses: input.statuses,
        offset: pageParam,
        limit: 50,
      });
      return page;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (
      lastPage.hasMore && lastPage.nextCursor ? Number(lastPage.nextCursor) : undefined
    ),
    enabled: input.enabled && Boolean(input.serviceId),
    staleTime: 60_000,
  });
}
