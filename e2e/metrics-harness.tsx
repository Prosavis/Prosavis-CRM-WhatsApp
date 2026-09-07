import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
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
import MetricsShell from '@/components/whatsapp/metrics/shared/MetricsShell';
import MetricsViewHeader from '@/components/whatsapp/metrics/shared/MetricsViewHeader';
import { darkTheme, lightTheme } from '@/theme/theme';
import type {
  ClientQualityMetrics,
  ClientSegmentsMetrics,
  DirectoryClientMetricRow,
  WhatsAppMetrics,
} from '@/types/whatsapp';
import { resolveMetricsDays, type MetricsDays, type MetricsVista } from '@/utils/metricsVistas';

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
  completedAppointments: [],
  completedMeta: {
    windowMonths: 6,
    windowFrom: '2026-04-01',
    windowTo: '2026-09-07',
    totalCompleted: 337,
    inSelectedPeriod: 83,
    lastCompletedDate: '2026-09-06T14:00:00.000Z',
  },
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

function HarnessView({ vista }: { vista: MetricsVista }) {
  const [mapMode, setMapMode] = React.useState<HeatmapMode>('density');
  if (vista === 'mapa') {
    return (
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
          title="Actividad operativa"
          purpose="Demanda inbound y servicios completados."
          periodLabel="Últimos 30 días"
          universeLabel="126 contactos únicos"
        />
        <InboundActivitySection
          series={metrics.inboundTimeseries}
          totals={metrics.inboundTotals}
          loading={false}
          days={30}
        />
        <CompletedServicesSection
          series={metrics.completedServicesTimeseries}
          appointments={metrics.completedAppointments}
          meta={metrics.completedMeta}
          loading={false}
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

function App() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('vista');
  const initialVista: MetricsVista = [
    'mapa',
    'calidad',
    'friccion',
    'clientes',
    'actividad',
    'outbound',
  ].includes(requested ?? '')
    ? (requested as MetricsVista)
    : 'calidad';
  const [vista, setVista] = useState(initialVista);
  const [days, setDays] = useState<MetricsDays>(resolveMetricsDays(params));
  const dark = params.get('theme') === 'dark';
  const updateScope = (key: string, value: string) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(key, value);
    window.history.replaceState(null, '', nextUrl);
  };

  return (
    <ThemeProvider theme={dark ? darkTheme : lightTheme}>
      <CssBaseline />
      <MemoryRouter>
        <Box sx={{ maxWidth: 1440, mx: 'auto', p: { xs: 1.5, sm: 3 } }}>
          <MetricsShell
            vista={vista}
            days={days}
            onVistaChange={(nextVista) => {
              setVista(nextVista);
              updateScope('vista', nextVista);
            }}
            onDaysChange={(nextDays) => {
              setDays(nextDays);
              updateScope('days', String(nextDays));
            }}
            context="Fixture reproducible · sin dependencias de producción"
          >
            <HarnessView vista={vista} />
          </MetricsShell>
        </Box>
      </MemoryRouter>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
