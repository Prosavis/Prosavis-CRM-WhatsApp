import { requireAdmin } from '../_shared/adminAuth.ts';
import {
  getFirestoreDocument,
  runFirestoreAggregation,
} from '../_shared/firebaseAdminRest.ts';
import { resolveRequestedServiceId } from '../_shared/fetchAllRows.ts';
import { callRpc, mapDirectorySnapshot } from '../_shared/historicalBootstrap.ts';
import { METRICS_TIMEZONE } from '../_shared/metricsContract.ts';
import {
  buildProfileHealth,
  buildWeeklyFromDaily,
  emptyDirectorySnapshot,
  todayBogotaKey,
} from '../_shared/appMetrics.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

function serviceEquals(serviceId: string) {
  return {
    where: {
      fieldFilter: {
        field: { fieldPath: 'serviceId' },
        op: 'EQUAL',
        value: { stringValue: serviceId },
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function countCollection(
  collectionId: string,
  query: Record<string, unknown>,
): Promise<number> {
  try {
    const result = await runFirestoreAggregation(collectionId, query, [
      { alias: 'n', count: {} },
    ]);
    return result.n ?? 0;
  } catch (error) {
    console.error(`count ${collectionId} failed`, error);
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const serviceId = resolveRequestedServiceId(body.serviceId);
    const today = todayBogotaKey();

    const [serviceDoc, favorites, contacts, unreadChats, bookingsDaily, lifetime, directory, statusCounts] =
      await Promise.all([
        getFirestoreDocument('services', serviceId).catch((error) => {
          console.error('service document failed', error);
          return null;
        }),
        countCollection('favorites', serviceEquals(serviceId)),
        countCollection('chats', serviceEquals(serviceId)),
        countCollection('chats', {
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'serviceId' },
                    op: 'EQUAL',
                    value: { stringValue: serviceId },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'unreadCount' },
                    op: 'GREATER_THAN',
                    value: { integerValue: '0' },
                  },
                },
              ],
            },
          },
        }),
        callRpc<unknown[]>(supabase, 'metrics_bookings_daily', { p_service_id: serviceId }),
        callRpc<unknown>(supabase, 'metrics_lifetime_collected', { p_service_id: serviceId }),
        callRpc(supabase, 'metrics_directory_snapshot', { p_service_id: serviceId }),
        callRpc<unknown[]>(supabase, 'metrics_booking_status_counts', { p_service_id: serviceId }),
      ]);

    const service = serviceDoc ?? {};
    const reviews = await getFirestoreDocument('googleReviews', serviceId).catch(() => null);
    const rating = Number(
      (reviews as { rating?: unknown } | null)?.rating ?? service.rating ?? 0,
    ) || 0;

    const appointmentDaily = (bookingsDaily ?? []).map((row) => {
      const rec = asRecord(row);
      return {
        bucket: String(rec.bucket_day ?? '').slice(0, 10),
        completed: Number(rec.completed) || 0,
        appointments: Number(rec.total) ||
          ((Number(rec.completed) || 0) + (Number(rec.canceled) || 0)),
        revenue: Number(rec.collected_cop) || 0,
      };
    }).filter((row) => row.bucket);

    const lifetimeRow = Array.isArray(lifetime) ? asRecord(lifetime[0]) : asRecord(lifetime);
    const counts = new Map<string, number>();
    for (const row of statusCounts ?? []) {
      const rec = asRecord(row);
      counts.set(String(rec.status ?? ''), Number(rec.count) || 0);
    }
    const pending = (counts.get('PENDING') ?? 0) + (counts.get('PENDING_RESCHEDULE') ?? 0);
    const confirmed = counts.get('CONFIRMED') ?? 0;
    const completed = counts.get('COMPLETED') ?? appointmentDaily.reduce((sum, row) => sum + row.completed, 0);
    const upcomingEnd = today;

    return strictJsonResponse(req, {
      serviceId,
      generatedAt: new Date().toISOString(),
      timezone: METRICS_TIMEZONE,
      profile: {
        ...buildProfileHealth({ ...service, rating }),
        rating,
        views: Number(service.views ?? service.viewsCount) || 0,
      },
      funnel: {
        views: Number(service.views ?? service.viewsCount) || 0,
        favorites,
        contacts,
      },
      chats: {
        total: contacts,
        unread: unreadChats,
        active: contacts,
      },
      appointments: {
        pending,
        confirmed,
        completed,
        upcoming: pending + confirmed,
        total: [...counts.values()].reduce((sum, n) => sum + n, 0),
      },
      weekly: buildWeeklyFromDaily(appointmentDaily, today),
      appointmentDaily: appointmentDaily.map((row) => ({
        bucket: row.bucket,
        completed: row.completed,
      })),
      directory: mapDirectorySnapshot(directory) ?? emptyDirectorySnapshot(),
      lifetimeCollectedTotal: Number(lifetimeRow.lifetime_collected_total) || 0,
      lifetimePaidAppointmentCount: Number(lifetimeRow.lifetime_paid_appointment_count) || 0,
      today: upcomingEnd,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('get-app-metrics failed', error);
    return strictJsonResponse(req, { error: String(error) }, 500);
  }
});
