import type { HistoricalMetricsBootstrap, MetricsWindowKey, OutboundFactRow } from './metricsContract.ts';
import { METRICS_TIMEZONE } from './metricsContract.ts';
import {
  assembleInboundTimeseries,
  buildCompletedWindowTotals,
  buildInboundWindowTotals,
  completedTimeseriesFromDaily,
  outboundWindowFromSql,
  rollupOutboundFacts,
  todayBogotaKey,
  type InboundContactDayRow,
} from './metricsWindows.ts';
import {
  buildQualityMetricsFromNucleus,
  qualitySummaryWithoutClients,
  type QualityNucleusRow,
} from './qualityMetrics.ts';

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error) {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === 'string' && maybe.message) return maybe.message;
  }
  return String(error);
}

export async function callRpc<T>(
  supabase: RpcClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${errorMessage(error)}`);
  return data as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapInboundRows(data: unknown): InboundContactDayRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const rec = asRecord(row);
    return {
      bucket_day: String(rec.bucket_day ?? '').slice(0, 10),
      stable_key: typeof rec.stable_key === 'string' ? rec.stable_key : null,
      first_contact_day: rec.first_contact_day
        ? String(rec.first_contact_day).slice(0, 10)
        : null,
      messages: asNumber(rec.messages),
    };
  });
}

export function mapOutboundFacts(data: unknown): OutboundFactRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const rec = asRecord(row);
    return {
      bucket: String(rec.bucket_day ?? rec.bucket ?? '').slice(0, 10),
      campaignType: String(rec.campaign_type ?? rec.campaignType ?? 'OTHER'),
      templateName: typeof rec.template_name === 'string'
        ? rec.template_name
        : (typeof rec.templateName === 'string' ? rec.templateName : null),
      status: String(rec.status ?? ''),
      messageCount: asNumber(rec.message_count ?? rec.messageCount),
    };
  });
}

export function mapCompletedDaily(data: unknown) {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const rec = asRecord(row);
      return {
        bucket: String(rec.bucket_day ?? rec.bucket ?? '').slice(0, 10),
        completed: asNumber(rec.completed),
      };
    })
    .filter((row) => row.bucket);
}

export function mapOutboundWindows(data: unknown) {
  const totals = {} as HistoricalMetricsBootstrap['outboundWindowTotals'];
  if (!Array.isArray(data)) return totals;
  for (const row of data) {
    const rec = asRecord(row);
    const span = String(rec.span ?? '') as MetricsWindowKey;
    if (!span) continue;
    totals[span] = outboundWindowFromSql({
      sent: asNumber(rec.sent),
      delivered: asNumber(rec.delivered),
      read: asNumber(rec.read),
      failed: asNumber(rec.failed),
      responses: asNumber(rec.responses),
      unique_messaged: asNumber(rec.unique_messaged),
      unique_responded: asNumber(rec.unique_responded),
    });
  }
  return totals;
}

export function mapDirectorySnapshot(data: unknown): HistoricalMetricsBootstrap['clientSegments'] {
  const rec = asRecord(data);
  const leads = asRecord(rec.leads);
  return {
    total: asNumber(rec.total),
    clients: asNumber(rec.clients),
    company: asNumber(rec.company),
    recurring: asNumber(rec.recurring),
    active: asNumber(rec.active),
    inactive: asNumber(rec.inactive),
    favorites: asNumber(rec.favorites),
    blacklist: asNumber(rec.blacklist),
    leads: {
      total: asNumber(leads.total),
      enSeguimiento: asNumber(leads.enSeguimiento),
      enRebooking: asNumber(leads.enRebooking),
      optOut: asNumber(leads.optOut),
      agendados: asNumber(leads.agendados),
    },
    optOutCount: asNumber(rec.optOutCount),
    directoryRows: asNumber(rec.directoryRows),
  };
}

export function mapQualityNucleus(data: unknown): QualityNucleusRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const rec = asRecord(row);
    return {
      directory_id: String(rec.directory_id ?? rec.id ?? ''),
      name: typeof rec.name === 'string' ? rec.name : null,
      phone: typeof rec.phone === 'string' ? rec.phone : null,
      classification: typeof rec.classification === 'string' ? rec.classification : null,
      tags: Array.isArray(rec.tags) ? rec.tags.filter((t): t is string => typeof t === 'string') : [],
      completed_count: asNumber(rec.completed_count),
      canceled_count: asNumber(rec.canceled_count),
      pago_pendiente: asNumber(rec.pago_pendiente),
      pago_aceptado: asNumber(rec.pago_aceptado),
      pago_en_proceso: asNumber(rec.pago_en_proceso),
    };
  });
}

export function mapHeatmapSummary(data: unknown): HistoricalMetricsBootstrap['heatmapSummary'] {
  const rec = asRecord(data);
  const coverage = asRecord(rec.coverage);
  const daily = Array.isArray(rec.daily)
    ? rec.daily.map((row) => {
      const item = asRecord(row);
      return {
        bucket: String(item.bucket ?? '').slice(0, 10),
        count: asNumber(item.count),
      };
    })
    : [];
  return {
    coverage: {
      total: asNumber(coverage.total),
      withGps: asNumber(coverage.withGps),
      withAddressOnly: asNumber(coverage.withAddressOnly),
      withoutPoint: asNumber(coverage.withoutPoint),
    },
    daily,
  };
}

export async function loadHistoricalBootstrap(
  supabase: RpcClient,
  input: { serviceId: string; phoneNumberId?: string },
): Promise<HistoricalMetricsBootstrap> {
  const phone = input.phoneNumberId ?? null;
  const [
    inboundRaw,
    outboundFactsRaw,
    outboundWindowsRaw,
    bookingsDailyRaw,
    lifetimeRaw,
    directoryRaw,
    qualityRaw,
    heatmapRaw,
  ] = await Promise.all([
    callRpc(supabase, 'metrics_inbound_contact_days', { p_phone_number_id: phone }),
    callRpc(supabase, 'metrics_outbound_facts', { p_phone_number_id: phone }),
    callRpc(supabase, 'metrics_outbound_window_totals', { p_phone_number_id: phone }),
    callRpc(supabase, 'metrics_bookings_daily', { p_service_id: input.serviceId }),
    callRpc(supabase, 'metrics_lifetime_collected', { p_service_id: input.serviceId }),
    callRpc(supabase, 'metrics_directory_snapshot', { p_service_id: input.serviceId }),
    callRpc(supabase, 'metrics_quality_nucleus', { p_service_id: input.serviceId }),
    callRpc(supabase, 'metrics_heatmap_summary', { p_service_id: input.serviceId }),
  ]);

  const today = todayBogotaKey();
  const inboundRows = mapInboundRows(inboundRaw);
  const inboundTimeseries = assembleInboundTimeseries(inboundRows, today);
  const inboundWindowTotals = buildInboundWindowTotals(inboundRows, today);
  const outboundFacts = mapOutboundFacts(outboundFactsRaw);
  const outboundLifetime = rollupOutboundFacts(outboundFacts, null);
  const completedDaily = mapCompletedDaily(bookingsDailyRaw);
  const lifetimeRow = Array.isArray(lifetimeRaw) ? asRecord(lifetimeRaw[0]) : asRecord(lifetimeRaw);
  const firstDay = inboundTimeseries.firstDay ?? completedDaily[0]?.bucket ?? today;
  const quality = buildQualityMetricsFromNucleus(mapQualityNucleus(qualityRaw));
  const directory = mapDirectorySnapshot(directoryRaw);

  return {
    timezone: METRICS_TIMEZONE,
    generatedAt: new Date().toISOString(),
    serviceId: input.serviceId,
    period: {
      from: `${firstDay}T05:00:00.000Z`,
      to: new Date().toISOString(),
    },
    today,
    inboundTimeseries: {
      day: inboundTimeseries.day,
      week: inboundTimeseries.week,
      month: inboundTimeseries.month,
    },
    inboundTotals: inboundWindowTotals.all,
    inboundWindowTotals,
    outboundFacts,
    outboundWindowTotals: mapOutboundWindows(outboundWindowsRaw),
    byCampaign: outboundLifetime.byCampaign,
    byTemplate: outboundLifetime.byTemplate,
    byKind: outboundLifetime.byKind,
    completedDaily,
    completedWindowTotals: buildCompletedWindowTotals(completedDaily, today),
    lifetimeCollectedTotal: asNumber(lifetimeRow.lifetime_collected_total),
    lifetimePaidAppointmentCount: asNumber(lifetimeRow.lifetime_paid_appointment_count),
    clientSegments: directory,
    qualitySummary: qualitySummaryWithoutClients(quality),
    heatmapSummary: mapHeatmapSummary(heatmapRaw),
    dataQuality: {
      inboundContactDays: inboundRows.length,
      outboundFactRows: outboundFacts.length,
      directoryRows: directory.directoryRows,
      completedDays: completedDaily.length,
    },
  };
}

export function bootstrapToLegacyMetrics(bootstrap: HistoricalMetricsBootstrap) {
  const outboundAll = bootstrap.outboundWindowTotals.all ?? {
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    reachedDevice: 0,
    responses: 0,
    uniqueMessaged: 0,
    uniqueResponded: 0,
    responseRate: 0,
    rawResponseRate: 0,
  };
  return {
    ...bootstrap,
    totalSent: outboundAll.sent,
    totalDelivered: outboundAll.delivered,
    totalRead: outboundAll.read,
    reachedDevice: outboundAll.reachedDevice,
    totalFailed: outboundAll.failed,
    totalResponses: outboundAll.responses,
    responseRate: outboundAll.responseRate,
    rawResponseRate: outboundAll.rawResponseRate,
    responseRateWarning: outboundAll.rawResponseRate > 100
      ? 'RAW_MESSAGE_RESPONSE_RATE_ABOVE_100'
      : null,
    responseRateDiagnostics: {
      responseRateBasis: 'unique_contacts',
      responseRateNumerator: outboundAll.uniqueResponded,
      responseRateDenominator: outboundAll.uniqueMessaged,
      rawResponseRateBasis: 'messages',
      rawResponseRateNumerator: outboundAll.responses,
      rawResponseRateDenominator: outboundAll.sent,
    },
    uniqueContactsMessaged: outboundAll.uniqueMessaged,
    uniqueContactsResponded: outboundAll.uniqueResponded,
    outboundTotals: {
      messageCounts: {
        sent: outboundAll.sent,
        delivered: outboundAll.delivered,
        read: outboundAll.read,
        reachedDevice: outboundAll.reachedDevice,
        failed: outboundAll.failed,
        responsesReceived: outboundAll.responses,
      },
      uniqueContacts: {
        messaged: outboundAll.uniqueMessaged,
        responded: outboundAll.uniqueResponded,
      },
    },
    optOutCount: bootstrap.clientSegments.optOutCount,
    leads: bootstrap.clientSegments.leads,
    completedServicesTimeseries: completedTimeseriesFromDaily(
      bootstrap.completedDaily,
      bootstrap.today,
    ),
  };
}
