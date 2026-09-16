/** Contrato canónico del bootstrap histórico de métricas (CRM + User Console). */

export const METRICS_TIMEZONE = 'America/Bogota';
export const METRICS_WINDOW_SPANS = [7, 14, 30, 60, 90] as const;
export type MetricsWindowSpan = (typeof METRICS_WINDOW_SPANS)[number];
export type MetricsWindowKey = `${MetricsWindowSpan}` | 'all';

export interface PeopleBucketPoint {
  bucket: string;
  messagesReceived: number;
  uniquePeople: number;
  newPeople: number;
  existingPeople: number;
}

export interface CompletedDayPoint {
  bucket: string;
  completed: number;
}

export const APPOINTMENT_STATUS_KEYS = [
  'pending',
  'pendingReschedule',
  'confirmed',
  'enRoute',
  'inProgress',
  'completed',
  'canceled',
  'rejected',
] as const;

export type AppointmentStatusKey = (typeof APPOINTMENT_STATUS_KEYS)[number];

export interface AppointmentStatusCounts {
  pending: number;
  pendingReschedule: number;
  confirmed: number;
  enRoute: number;
  inProgress: number;
  completed: number;
  canceled: number;
  rejected: number;
  total: number;
}

export interface AppointmentStatusDayPoint extends AppointmentStatusCounts {
  bucket: string;
  collectedCop?: number;
  paidCount?: number;
}

export interface AppointmentStatusGroups {
  scheduled: number;
  inProgress: number;
  completed: number;
  canceled: number;
  rejected: number;
}

export const APPOINTMENT_STATUS_GROUP_KEYS = [
  'scheduled',
  'inProgress',
  'completed',
  'canceled',
  'rejected',
] as const;

export type AppointmentStatusGroupKey = (typeof APPOINTMENT_STATUS_GROUP_KEYS)[number];

export const APPOINTMENT_STATUS_GROUP_VALUES: Record<AppointmentStatusGroupKey, readonly string[]> = {
  scheduled: ['PENDING', 'PENDING_RESCHEDULE', 'CONFIRMED'],
  inProgress: ['EN_ROUTE', 'IN_PROGRESS'],
  completed: ['COMPLETED'],
  canceled: ['CANCELED'],
  rejected: ['REJECTED'],
};

export interface OutboundFactRow {
  bucket: string;
  campaignType: string;
  templateName: string | null;
  status: string;
  messageCount: number;
}

export interface OutboundBucket {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  outboundOk: number;
  total: number;
}

export interface OutboundWindowTotals {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  reachedDevice: number;
  responses: number;
  uniqueMessaged: number;
  uniqueResponded: number;
  responseRate: number;
  rawResponseRate: number;
}

export interface InboundWindowTotals {
  messagesReceived: number;
  uniquePeople: number;
  newPeople: number;
  existingPeople: number;
}

export interface DirectorySnapshot {
  total: number;
  clients: number;
  company: number;
  recurring: number;
  active: number;
  inactive: number;
  favorites: number;
  blacklist: number;
  leads: {
    total: number;
    enSeguimiento: number;
    enRebooking: number;
    optOut: number;
    agendados: number;
  };
  optOutCount: number;
  directoryRows: number;
}

export interface HeatmapSummary {
  coverage: {
    total: number;
    withGps: number;
    withAddressOnly: number;
    withoutPoint: number;
  };
  daily: Array<{ bucket: string; count: number }>;
}

export interface MetricsDetailPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AppProfileHealthCriterion {
  key: string;
  label: string;
  weight: number;
  isMet: boolean;
  suggestion: string;
}

export interface AppMetricsSnapshot {
  serviceId: string;
  generatedAt: string;
  timezone: typeof METRICS_TIMEZONE;
  profile: {
    name: string | null;
    description: string | null;
    mainImage: string | null;
    imagesCount: number;
    featuresCount: number;
    providerIsVerified: boolean;
    instagram: string | null;
    whatsappNumber: string | null;
    facebook: string | null;
    callPhonesCount: number;
    rating: number;
    views: number;
    health: {
      score: number;
      completedCriteria: number;
      totalCriteria: number;
      criteria: AppProfileHealthCriterion[];
    };
  };
  funnel: {
    views: number;
    favorites: number;
    contacts: number;
  };
  chats: {
    total: number;
    unread: number;
    active: number;
  };
  appointments: {
    pending: number;
    confirmed: number;
    completed: number;
    upcoming: number;
    total: number;
  };
  weekly: {
    weekStart: string;
    weekEnd: string;
    servicesCompleted: number;
    totalAppointments: number;
    totalRevenue: number;
    comparedToPrevWeek: {
      servicesChange: number;
      revenueChange: number;
    };
  };
  appointmentDaily: CompletedDayPoint[];
  directory: DirectorySnapshot;
}

export interface HistoricalMetricsBootstrap {
  timezone: typeof METRICS_TIMEZONE;
  generatedAt: string;
  serviceId: string;
  period: { from: string; to: string };
  today: string;
  inboundTimeseries: {
    day: PeopleBucketPoint[];
    week: PeopleBucketPoint[];
    month: PeopleBucketPoint[];
  };
  inboundTotals: InboundWindowTotals;
  inboundWindowTotals: Record<MetricsWindowKey, InboundWindowTotals>;
  outboundFacts: OutboundFactRow[];
  outboundWindowTotals: Record<MetricsWindowKey, OutboundWindowTotals>;
  byCampaign: Record<string, OutboundBucket>;
  byTemplate: Record<string, OutboundBucket>;
  byKind: { session: OutboundBucket; template: OutboundBucket };
  completedDaily: CompletedDayPoint[];
  completedWindowTotals: Record<MetricsWindowKey, number>;
  appointmentDaily: AppointmentStatusDayPoint[];
  appointmentWindowTotals: Record<MetricsWindowKey, AppointmentStatusCounts>;
  lifetimeCollectedTotal: number;
  lifetimePaidAppointmentCount: number;
  clientSegments: DirectorySnapshot;
  qualitySummary: unknown;
  heatmapSummary: HeatmapSummary;
  dataQuality: {
    inboundContactDays: number;
    outboundFactRows: number;
    outboundContactDays: number;
    directoryRows: number;
    completedDays: number;
  };
}
