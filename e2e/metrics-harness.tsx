import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import CalidadSection from '@/components/whatsapp/metrics/CalidadSection';
import ClientSegmentsSection from '@/components/whatsapp/metrics/ClientSegmentsSection';
import CompletedServicesSection from '@/components/whatsapp/metrics/CompletedServicesSection';
import FriccionSection from '@/components/whatsapp/metrics/FriccionSection';
import HeatmapSection, {
  type HeatmapMode,
} from '@/components/whatsapp/metrics/HeatmapSection';
import InboundActivitySection from '@/components/whatsapp/metrics/InboundActivitySection';
import OutboundBreakdownTables from '@/components/whatsapp/metrics/OutboundBreakdownTables';
import OutboundMessageLog from '@/components/whatsapp/metrics/OutboundMessageLog';
import MetricsKpiCard from '@/components/whatsapp/metrics/shared/MetricsKpiCard';
import MetricsKpiGrid from '@/components/whatsapp/metrics/shared/MetricsKpiGrid';
import AppDataSection from '@/components/whatsapp/metrics/app/AppDataSection';
import LifetimeRevenueBanner from '@/components/whatsapp/metrics/shared/LifetimeRevenueBanner';
import MetricsPeriodControl from '@/components/whatsapp/metrics/shared/MetricsPeriodControl';
import MetricsShell from '@/components/whatsapp/metrics/shared/MetricsShell';
import MetricsViewHeader from '@/components/whatsapp/metrics/shared/MetricsViewHeader';
import { darkTheme, lightTheme } from '@/theme/theme';
import type {
  ClientQualityMetrics,
  ClientSegmentsMetrics,
  DirectoryClientMetricRow,
  WhatsAppMetrics,
} from '@/types/whatsapp';
import {
  metricsPeriodLabel,
  persistAndApplyMetricsDays,
  readMetricsDaysPreferences,
  resolveMetricsDays,
  vistaDayParam,
  type MetricsDays,
  type MetricsVista,
} from '@/utils/metricsVistas';

const HARNESS_VISTAS: MetricsVista[] = [
  'resumen',
  'app',
  'mapa',
  'calidad',
  'friccion',
  'clientes',
  'actividad',
  'outbound',
];

const appSnapshot = {
  serviceId: 'nwEMgpEqVwY3o95u3PNE',
  generatedAt: '2026-09-16T16:00:00.000Z',
  today: '2026-09-16',
  profile: {
    name: 'Prosavis Limpieza',
    rating: 4.8,
    views: 1280,
    health: {
      score: 86,
      completedCriteria: 6,
      totalCriteria: 7,
      criteria: [
        { key: 'photos', label: 'Fotos', weight: 20, isMet: true, suggestion: '' },
        { key: 'rating', label: 'Calificación', weight: 20, isMet: true, suggestion: '' },
      ],
    },
  },
  funnel: { views: 1280, favorites: 96, contacts: 41 },
  chats: { total: 54, unread: 3, active: 12 },
  appointments: { pending: 8, confirmed: 11, completed: 337, upcoming: 6, total: 362 },
  weekly: {
    weekStart: '2026-09-10',
    weekEnd: '2026-09-16',
    servicesCompleted: 18,
    totalAppointments: 24,
    totalRevenue: 4_200_000,
    comparedToPrevWeek: { servicesChange: 12, revenueChange: 8 },
  },
  appointmentDaily: [
    { bucket: '2026-09-10', completed: 3 },
    { bucket: '2026-09-11', completed: 2 },
    { bucket: '2026-09-16', completed: 1 },
  ],
};

const quality: ClientQualityMetrics = {
  nucleusSize: 83,
  period: { from: null, to: null },
  tags: [
    { key: 'agendado', label: 'Agendado', count: 67, pct: 80.7, ratio: null },
    { key: 'recurrente', label: 'Recurrente', count: 14, pct: 16.9, ratio: null },
    { key: 'favoritos', label: 'Favoritos', count: 3, pct: 3.6, ratio: 28 },
    { key: 'problematica', label: 'Problemática', count: 3, pct: 3.6, ratio: 28 },
    { key: 'bloqueado', label: 'Bloqueado', count: 3, pct: 3.6, ratio: 28 },
    { key: 'decline', label: 'Decline', count: 2, pct: 2.4, ratio: 42 },
  ],
  layers: [
    { key: 'favorite', label: 'Favorito', count: 3, pct: 3.6 },
    { key: 'recurring', label: 'Recurrente / sólido', count: 30, pct: 36.1 },
    { key: 'standard', label: 'Estándar', count: 45, pct: 54.2 },
    { key: 'risk', label: 'Riesgo', count: 5, pct: 6 },
  ],
  riskUnique: { count: 5, pct: 6, ratio: 17 },
  favoritesVsRest: {
    favorites: { n: 3, avgCompleted: 4.7, pctTwoPlus: 66.7 },
    rest: { n: 80, avgCompleted: 2.9, pctTwoPlus: 36.3 },
  },
  cancellations: {
    clientsWithCanceled: 22,
    clientsWithCanceledPct: 26.5,
    canceledBookings: 29,
    pagoPendiente: 23,
    pagoAceptado: 6,
    pagoEnProceso: 0,
  },
  crossCancel: [
    { key: 'favorite', label: 'Favorito', withCanceled: 1, total: 3 },
    { key: 'recurring', label: 'Recurrente / sólido', withCanceled: 10, total: 30 },
    { key: 'standard', label: 'Estándar', withCanceled: 10, total: 45 },
    { key: 'risk', label: 'Riesgo', withCanceled: 1, total: 5 },
  ],
  clients: Array.from({ length: 36 }, (_, index) => ({
    id: `client-${index}`,
    name: `Cliente ${index + 1}`,
    phone: `300000${String(index).padStart(4, '0')}`,
    layer: index < 3 ? 'favorite' : index < 8 ? 'risk' : index < 22 ? 'recurring' : 'standard',
    completedCount: (index % 7) + 1,
    canceledCount: index % 4 === 0 ? 1 : 0,
    tags: index < 3 ? ['Favoritos'] : index < 8 ? ['Problemática'] : ['Agendado'],
    isFavorite: index < 3,
    isProblematica: index >= 3 && index < 8,
    isBloqueado: false,
    isDecline: false,
    isRecurringTag: index >= 8 && index < 22,
    isCompany: index % 10 === 0,
    isAgendado: true,
    isParar: false,
  })) as ClientQualityMetrics['clients'],
};

const clientSegments: ClientSegmentsMetrics = {
  total: 240,
  clients: 83,
  company: 7,
  recurring: 30,
  active: 52,
  inactive: 31,
  favorites: 3,
  blacklist: 5,
};

const directoryClients: DirectoryClientMetricRow[] = Array.from(
  { length: 36 },
  (_, index) => ({
    id: `directory-${index}`,
    name: `Cliente ${index + 1}`,
    phone: `300000${String(index).padStart(4, '0')}`,
    classification: 'Cliente',
    tags: index < 3 ? ['Favoritos'] : ['Agendado'],
    isCompany: index % 10 === 0,
    isRecurring: index % 3 === 0,
    isAgendado: true,
    isFavorite: index < 3,
    isClient: true,
    isActive: index < 22,
    isBlacklisted: index >= 31,
    blacklistReason: index >= 31 ? 'No contactar' : null,
    lastAppointmentDate: '2026-09-01T14:00:00.000Z',
  }),
);

const metrics: WhatsAppMetrics = {
  period: { from: '2026-08-09', to: '2026-09-07' },
  totalSent: 420,
  totalDelivered: 380,
  totalRead: 310,
  reachedDevice: 380,
  totalFailed: 40,
  totalResponses: 96,
  responseRate: 34.8,
  rawResponseRate: 22.9,
  responseRateWarning: null,
  responseRateDiagnostics: {
    responseRateBasis: 'unique_contacts',
    responseRateNumerator: 72,
    responseRateDenominator: 207,
    rawResponseRateBasis: 'messages',
    rawResponseRateNumerator: 96,
    rawResponseRateDenominator: 420,
  },
  outboundTotals: {
    messageCounts: {
      sent: 420,
      delivered: 380,
      read: 310,
      reachedDevice: 380,
      failed: 40,
      responsesReceived: 96,
    },
    uniqueContacts: { messaged: 207, responded: 72 },
  },
  optOutCount: 4,
  uniqueContactsMessaged: 207,
  uniqueContactsResponded: 72,
  byCampaign: {
    SEGUIMIENTO: { sent: 180, delivered: 162, read: 130, failed: 18, outboundOk: 180, total: 198 },
    REBOOKING: { sent: 240, delivered: 218, read: 180, failed: 22, outboundOk: 240, total: 262 },
  },
  byTemplate: {},
  byKind: {
    session: { sent: 120, delivered: 110, read: 92, failed: 10, outboundOk: 120, total: 130 },
    template: { sent: 300, delivered: 270, read: 218, failed: 30, outboundOk: 300, total: 330 },
  },
  leads: { total: 240, enSeguimiento: 42, enRebooking: 33, optOut: 4, agendados: 18 },
  inboundTotals: { messagesReceived: 310, uniquePeople: 126, newPeople: 44, existingPeople: 82 },
  inboundTimeseries: {
    day: Array.from({ length: 14 }, (_, index) => ({
      bucket: `2026-08-${String(index + 20).padStart(2, '0')}`,
      messagesReceived: 12 + index,
      uniquePeople: 7 + (index % 4),
      newPeople: 2 + (index % 3),
      existingPeople: 5 + (index % 2),
    })),
    week: [],
    month: [],
  },
  clientSegments,
  directoryClients,
  completedServicesTimeseries: {
    day: [],
    week: [],
    month: [
      { bucket: '2026-04', completed: 42 },
      { bucket: '2026-05', completed: 56 },
      { bucket: '2026-06', completed: 61 },
      { bucket: '2026-07', completed: 74 },
      { bucket: '2026-08', completed: 83 },
      { bucket: '2026-09', completed: 21 },
    ],
  },
  appointmentTimeseries: {
    day: [],
    week: [],
    month: [
      { bucket: '2026-04', pending: 3, pendingReschedule: 1, confirmed: 6, enRoute: 0, inProgress: 1, completed: 42, canceled: 6, rejected: 1, total: 60 },
      { bucket: '2026-05', pending: 2, pendingReschedule: 0, confirmed: 5, enRoute: 1, inProgress: 0, completed: 56, canceled: 7, rejected: 0, total: 71 },
      { bucket: '2026-06', pending: 4, pendingReschedule: 1, confirmed: 4, enRoute: 0, inProgress: 2, completed: 61, canceled: 5, rejected: 1, total: 78 },
      { bucket: '2026-07', pending: 3, pendingReschedule: 0, confirmed: 7, enRoute: 1, inProgress: 1, completed: 74, canceled: 4, rejected: 0, total: 90 },
      { bucket: '2026-08', pending: 2, pendingReschedule: 1, confirmed: 8, enRoute: 0, inProgress: 1, completed: 83, canceled: 6, rejected: 1, total: 102 },
      { bucket: '2026-09', pending: 8, pendingReschedule: 1, confirmed: 5, enRoute: 1, inProgress: 1, completed: 21, canceled: 3, rejected: 1, total: 41 },
    ],
  },
  completedAppointments: [
    {
      id: 'appt-1',
      scheduledDate: '2026-09-06T14:00:00.000Z',
      status: 'COMPLETED',
      clientName: 'Ana Pérez',
      clientPhone: '3001112233',
      providerName: 'Johanna',
      teamMemberId: 'tm-1',
      duration: 180,
      totalAmount: 180000,
      paidAmount: 180000,
      pendingAmount: 0,
      paymentStatus: 'PAGO_ACEPTADO',
      addressLine: 'Cra 7 # 12-34',
      serviceTitle: 'Limpieza',
    },
    {
      id: 'appt-2',
      scheduledDate: '2026-09-20T15:00:00.000Z',
      status: 'CONFIRMED',
      clientName: 'Carlos Ruiz',
      clientPhone: '3004445566',
      providerName: 'Jennifer',
      teamMemberId: 'tm-2',
      duration: 240,
      totalAmount: 220000,
      paidAmount: 0,
      pendingAmount: 220000,
      paymentStatus: 'PAGO_PENDIENTE',
      addressLine: 'Cll 12 # 8-20',
      serviceTitle: 'Limpieza',
    },
  ],
  completedMeta: {
    windowMonths: 6,
    windowFrom: '2026-04-01',
    windowTo: '2026-09-07',
    totalCompleted: 337,
    inSelectedPeriod: 83,
    lastCompletedDate: '2026-09-06T14:00:00.000Z',
    today: '2026-09-16',
    currentMonth: '2026-09',
    comparisons: {
      mtd: { current: 21, previous: 18, growth: 16.7 },
      rolling30d: { current: 83, previous: 74, growth: 12.2 },
      lastClosedMonth: { current: 83, previous: 74, growth: 12.2, month: '2026-08' },
    },
  },
  lifetimeCollectedTotal: 248_500_000,
  lifetimePaidAppointmentCount: 412,
  serviceId: 'nwEMgpEqVwY3o95u3PNE',
  dataQuality: { messageLogRows: 500, directoryRows: 240, appointmentRows: 337 },
};

const logs = Array.from({ length: 18 }, (_, index) => ({
  id: `log-${index}`,
  recipientPhone: `300000${String(index).padStart(4, '0')}`,
  templateName: index % 2 === 0 ? 'seguimiento_cliente' : undefined,
  status: index % 7 === 0 ? 'failed' : 'delivered',
  direction: 'outbound',
  createdAt: new Date(`2026-09-0${(index % 7) + 1}T14:00:00.000Z`),
  campaignType: index % 2 === 0 ? 'SEGUIMIENTO' : 'REBOOKING',
}));

function HarnessView({
  vista,
  days,
  onDaysChange,
}: {
  vista: MetricsVista;
  days: MetricsDays;
  onDaysChange: (days: MetricsDays) => void;
}) {
  const [mapMode, setMapMode] = React.useState<HeatmapMode>('density');
  const periodControl = vistaDayParam(vista)
    ? <MetricsPeriodControl days={days} onDaysChange={onDaysChange} />
    : null;
  if (vista === 'resumen') {
    return (
      <>
        {periodControl}
        <MetricsViewHeader
          title="Resumen operativo"
          purpose="Ingresos históricos cobrados y agendamientos por estado."
          periodLabel={metricsPeriodLabel(days)}
          universeLabel="442 agendamientos históricos"
        />
        <LifetimeRevenueBanner
          lifetimeCollectedTotal={metrics.lifetimeCollectedTotal ?? 0}
          lifetimePaidAppointmentCount={metrics.lifetimePaidAppointmentCount ?? 0}
        />
        <CompletedServicesSection
          series={metrics.appointmentTimeseries}
          appointments={metrics.completedAppointments}
          meta={metrics.completedMeta}
          loading={false}
        />
      </>
    );
  }
  if (vista === 'app') {
    return (
      <AppDataSection
        data={appSnapshot}
        days={days}
        onDaysChange={onDaysChange}
        updatedAt={new Date('2026-09-16T16:00:00.000Z').getTime()}
      />
    );
  }
  if (vista === 'mapa') {
    return (
      <>
        {periodControl}
        <HeatmapSection
        data={{
          source: 'gps',
          coverage: { total: 83, withGps: 68, withAddressOnly: 10, withoutPoint: 5 },
          points: Array.from({ length: 34 }, (_, index) => ({
            id: `point-${index}`,
            lat: 4.813 + (index % 6) * 0.003,
            lng: -75.696 + (index % 5) * 0.003,
            source: 'gps',
            layer: index % 9 === 0 ? 'risk' : index % 4 === 0 ? 'recurring' : 'standard',
            status: 'COMPLETED',
            scheduledStart: '2026-09-01T14:00:00.000Z',
          })),
        }}
        loading={false}
        preferGps
        onPreferGpsChange={() => undefined}
        status="all"
        onStatusChange={() => undefined}
        layer="all"
        onLayerChange={() => undefined}
        mode={mapMode}
        onModeChange={setMapMode}
        periodLabel="2026-08-09 – 2026-09-07"
        updatedAt={new Date('2026-09-07T16:00:00.000Z').getTime()}
      />
      </>
    );
  }
  if (vista === 'calidad') return <CalidadSection metrics={quality} loading={false} />;
  if (vista === 'friccion') return <FriccionSection metrics={quality} loading={false} />;
  if (vista === 'clientes') {
    return (
      <>
        <MetricsViewHeader
          title="Directorio y segmentos"
          purpose="Composición operativa del directorio."
          universeLabel="240 contactos"
        />
        <ClientSegmentsSection
          segments={clientSegments}
          clients={directoryClients}
          loading={false}
        />
      </>
    );
  }
  if (vista === 'actividad') {
    return (
      <>
        <MetricsViewHeader
          title="Actividad inbound"
          purpose="Demanda recibida por personas y mensajes, sin mezclarla con servicios completados."
          periodLabel="Últimos 30 días"
          universeLabel="126 contactos únicos"
        />
        {periodControl}
        <InboundActivitySection
          series={metrics.inboundTimeseries}
          totals={metrics.inboundTotals}
          loading={false}
          days={30}
        />
      </>
    );
  }
  return (
    <>
      <MetricsViewHeader
        title="Rendimiento outbound"
        purpose="Mensajes, alcance único y respuesta."
        periodLabel="Últimos 30 días"
        universeLabel="207 contactos alcanzados"
      />
      {periodControl}
      <MetricsKpiGrid>
        <MetricsKpiCard label="Mensajes enviados" value="420" />
        <MetricsKpiCard label="En el dispositivo" value="380" tone="success" />
        <MetricsKpiCard label="Contactos que respondieron" value="72" tone="warning" />
        <MetricsKpiCard label="Fallidos" value="40" tone="risk" />
      </MetricsKpiGrid>
      <Box sx={{ mt: 2 }}>
        <OutboundBreakdownTables metrics={metrics} />
      </Box>
      <Box sx={{ mt: 2 }}>
        <OutboundMessageLog
          logs={logs.slice(0, 15)}
          totalCount={logs.length}
          page={0}
          rowsPerPage={15}
          loading={false}
          warning={null}
          truncated
          searchTerm=""
          statusFilter="all"
          onSearchChange={() => undefined}
          onStatusChange={() => undefined}
          onPageChange={() => undefined}
          onClearFilters={() => undefined}
          onClearWarning={() => undefined}
          onDownload={() => undefined}
        />
      </Box>
    </>
  );
}

const harnessQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function App() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('vista');
  const initialVista: MetricsVista = HARNESS_VISTAS.includes(requested as MetricsVista)
    ? (requested as MetricsVista)
    : 'resumen';
  const storedDays = readMetricsDaysPreferences();
  const [vista, setVista] = useState(initialVista);
  const [periods, setPeriods] = useState({
    completedDays: resolveMetricsDays(params, 'completedDays', storedDays.completedDays),
    mapDays: resolveMetricsDays(params, 'mapDays', storedDays.mapDays),
    activityDays: resolveMetricsDays(params, 'activityDays', storedDays.activityDays),
    outboundDays: resolveMetricsDays(params, 'outboundDays', storedDays.outboundDays),
    appDays: resolveMetricsDays(params, 'appDays', storedDays.appDays),
  });
  const dark = params.get('theme') === 'dark';
  const updateScope = (key: string, value: string) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(key, value);
    window.history.replaceState(null, '', nextUrl);
  };
  const dayParam = vistaDayParam(vista);
  const days = dayParam ? periods[dayParam] : 'all';

  return (
    <QueryClientProvider client={harnessQueryClient}>
    <ThemeProvider theme={dark ? darkTheme : lightTheme}>
      <CssBaseline />
      <MemoryRouter>
        <Box sx={{ maxWidth: 1440, mx: 'auto', p: { xs: 1.5, sm: 3 }, overflowX: 'hidden' }}>
          <MetricsShell
            vista={vista}
            onVistaChange={(nextVista) => {
              setVista(nextVista);
              updateScope('vista', nextVista);
            }}
            context="Fixture reproducible · sin dependencias de producción"
          >
            <HarnessView
              vista={vista}
              days={days}
              onDaysChange={(nextDays) => {
                if (!dayParam) return;
                persistAndApplyMetricsDays(new URLSearchParams(window.location.search), dayParam, nextDays);
                setPeriods((current) => ({ ...current, [dayParam]: nextDays }));
                updateScope(dayParam, String(nextDays));
              }}
            />
          </MetricsShell>
        </Box>
      </MemoryRouter>
    </ThemeProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
