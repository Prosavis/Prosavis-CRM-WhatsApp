import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip as MuiTooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import CloseIcon from '@mui/icons-material/Close';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  METRICS_CHART_AMBER,
  METRICS_CHART_BLUE,
  METRICS_CHART_GREEN,
  METRICS_CHART_RED,
  METRICS_CHART_VIOLET,
  METRICS_NEGATIVE_TEXT,
  METRICS_POSITIVE_TEXT,
} from '@/constants/metricsChartColors';
import { useAppointmentMetricsInfiniteQuery } from '@/hooks/useWhatsAppMetricsQueries';
import { listAllAppointmentMetrics } from '@/services/whatsappService';
import type {
  AppointmentStatusDayPoint,
  CompletedAppointmentDetail,
  MetricsGranularSeries,
  WhatsAppMetrics,
} from '@/types/whatsapp';
import {
  APPOINTMENT_GROUP_LABELS,
  APPOINTMENT_STATUS_GROUP_VALUES,
  appointmentStatusLabel,
  bucketToDateRange,
  completionRate,
  groupAppointmentStatuses,
  labelAppointmentStatusSeries,
  sumAppointmentStatus,
  trimEmptyAppointmentEdges,
  type AppointmentStatusGroupKey,
  type LabeledAppointmentStatusPoint,
} from '@/utils/appointmentStatusMetrics';
import {
  currentBucketKeyForToday,
  type MetricsGranularity,
} from './utils/aggregateBuckets';
import {
  addStyledSheet,
  downloadWorkbook,
  excelGeneratedAtLine,
} from './utils/exportMetricsExcel';
import {
  BarGradient,
  ChartTooltipCard,
  chartAxisTick,
  chartColor,
  chartGridStroke,
  formatAxisInt,
} from './utils/chartTheme';
import MetricsSection from './MetricsSection';
import MetricsContextBanner from './shared/MetricsContextBanner';

const GRANULARITY_LABEL: Record<MetricsGranularity, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
};

interface CompletedServicesSectionProps {
  series?: MetricsGranularSeries<AppointmentStatusDayPoint>;
  appointments?: CompletedAppointmentDetail[];
  meta?: WhatsAppMetrics['completedMeta'];
  serviceId?: string;
  periodRange?: { from: string | null; to: string | null };
  loading: boolean;
}

function formatInt(n: number): string {
  return n.toLocaleString('es-CO');
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PAGO_ACEPTADO: 'Pagado',
  PAGADO: 'Pagado',
  PAGO_PENDIENTE: 'Pendiente',
  PENDIENTE: 'Pendiente',
  RECHAZADO: 'Rechazado',
  REEMBOLSADO: 'Reembolsado',
};

function formatPaymentStatus(status: string | null | undefined): string {
  if (!status) return '—';
  return PAYMENT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

function shortMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CO', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

interface ComparisonLens {
  key: string;
  title: string;
  current: number;
  previous: number;
  growth: number | null;
  explanation: string;
  neutral?: boolean;
}

const ComparisonCard: React.FC<{ lens: ComparisonLens }> = ({ lens }) => {
  const theme = useTheme();
  const { growth, neutral } = lens;
  const hasGrowth = growth != null;
  const sign = !hasGrowth ? 0 : growth > 0 ? 1 : growth < 0 ? -1 : 0;
  const color =
    neutral || sign === 0
      ? theme.palette.text.secondary
      : sign > 0
        ? theme.palette.mode === 'light'
          ? METRICS_POSITIVE_TEXT
          : theme.palette.success.light
        : theme.palette.mode === 'light'
          ? METRICS_NEGATIVE_TEXT
          : theme.palette.error.light;
  const Icon =
    !hasGrowth || sign === 0
      ? TrendingFlatIcon
      : sign > 0
        ? TrendingUpIcon
        : TrendingDownIcon;
  const growthText = hasGrowth ? `${growth > 0 ? '+' : ''}${growth}%` : 's/d';
  return (
    <Box
      sx={{
        height: '100%',
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover': { borderColor: alpha(color, 0.5), boxShadow: 1 },
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={700}>
        {lens.title}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Icon sx={{ fontSize: 20, color }} />
        <Typography variant="h6" fontWeight={800} sx={{ color, lineHeight: 1.1 }}>
          {growthText}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {formatInt(lens.current)} actual · {formatInt(lens.previous)} previo
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 'auto', pt: 0.5, lineHeight: 1.35 }}
      >
        {lens.explanation}
      </Typography>
    </Box>
  );
};

interface StatusChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: LabeledAppointmentStatusPoint }>;
}

const StatusChartTooltip: React.FC<StatusChartTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <ChartTooltipCard
      title={`${point.label}${point.isPartial ? ' (en curso)' : ''}`}
      rows={[
        { label: 'Total', value: formatInt(point.total) },
        { label: 'Completados', value: formatInt(point.completed), color: METRICS_CHART_GREEN },
        { label: 'Agendados', value: formatInt(point.stackedScheduled), color: METRICS_CHART_BLUE },
        { label: 'En ejecución', value: formatInt(point.stackedInProgress), color: METRICS_CHART_AMBER },
        { label: 'Cancelados', value: formatInt(point.canceled), color: METRICS_CHART_RED },
        { label: 'Rechazados', value: formatInt(point.rejected), color: METRICS_CHART_VIOLET },
        { label: 'Pendiente / reprogramar / confirmada', value: `${point.pending} / ${point.pendingReschedule} / ${point.confirmed}` },
        { label: 'En ruta / en curso', value: `${point.enRoute} / ${point.inProgress}` },
      ]}
      hint="Clic para ver citas"
    />
  );
};

type DetailScope = {
  kind: 'bucket' | 'period';
  bucket?: string;
  group: AppointmentStatusGroupKey | 'all';
};

const CompletedServicesSection: React.FC<CompletedServicesSectionProps> = ({
  series,
  appointments,
  meta,
  serviceId,
  periodRange,
  loading,
}) => {
  const theme = useTheme();
  const [granularity, setGranularity] = useState<MetricsGranularity>('month');
  const [detailScope, setDetailScope] = useState<DetailScope | null>(null);

  const handleGranularityChange = (next: MetricsGranularity) => {
    setGranularity(next);
    setDetailScope(null);
  };

  const currentBucketKey = useMemo(
    () => currentBucketKeyForToday(granularity, meta?.today),
    [granularity, meta?.today],
  );

  const data = useMemo(() => {
    if (!series) return [];
    return labelAppointmentStatusSeries(series[granularity] ?? [], granularity, currentBucketKey);
  }, [series, granularity, currentBucketKey]);

  const chartData = useMemo(() => {
    if (granularity === 'day') return data;
    return trimEmptyAppointmentEdges(data);
  }, [data, granularity]);

  const viewTotals = useMemo(() => sumAppointmentStatus(chartData), [chartData]);
  const viewGroups = useMemo(() => groupAppointmentStatuses(viewTotals), [viewTotals]);
  const viewRate = completionRate(viewTotals);
  const comparisons = meta?.comparisons;

  const completedColor = chartColor(theme, METRICS_CHART_GREEN);
  const scheduledColor = chartColor(theme, METRICS_CHART_BLUE);
  const runningColor = chartColor(theme, METRICS_CHART_AMBER);
  const canceledColor = chartColor(theme, METRICS_CHART_RED);
  const rejectedColor = chartColor(theme, METRICS_CHART_VIOLET);
  const lineColor = chartColor(theme, METRICS_CHART_BLUE);

  const comparisonLenses = useMemo<ComparisonLens[]>(() => {
    const lenses: ComparisonLens[] = [];
    if (comparisons) {
      lenses.push({
        key: 'mtd',
        title: 'Mes a la fecha',
        current: comparisons.mtd.current,
        previous: comparisons.mtd.previous,
        growth: comparisons.mtd.growth,
        explanation:
          'Completados de los días transcurridos de este mes vs los mismos días del mes anterior.',
      });
      lenses.push({
        key: 'rolling30d',
        title: 'Últimos 30 días',
        current: comparisons.rolling30d.current,
        previous: comparisons.rolling30d.previous,
        growth: comparisons.rolling30d.growth,
        explanation: 'Completados de los últimos 30 días vs los 30 días inmediatamente previos.',
      });
      if (comparisons.lastClosedMonth) {
        lenses.push({
          key: 'lastClosedMonth',
          title: `Último mes cerrado (${shortMonthLabel(comparisons.lastClosedMonth.month)})`,
          current: comparisons.lastClosedMonth.current,
          previous: comparisons.lastClosedMonth.previous,
          growth: comparisons.lastClosedMonth.growth,
          explanation:
            'Completados del último mes completo vs el mes cerrado anterior.',
        });
      }
    }
    if (chartData.length >= 2) {
      const last = chartData[chartData.length - 1];
      const prev = chartData[chartData.length - 2];
      lenses.push({
        key: 'lastPeriod',
        title: 'Variación último periodo',
        current: last.completed,
        previous: prev.completed,
        growth: last.growth,
        neutral: true,
        explanation:
          'Compara completados del periodo en curso (parcial) vs el anterior según la granularidad.',
      });
    }
    return lenses;
  }, [comparisons, chartData]);

  const selectedRow = useMemo(
    () => chartData.find((row) => row.bucket === detailScope?.bucket) ?? null,
    [chartData, detailScope],
  );

  const queryRange = useMemo(() => {
    if (!detailScope) return { from: null as string | null, to: null as string | null };
    if (detailScope.kind === 'bucket' && detailScope.bucket) {
      return bucketToDateRange(detailScope.bucket, granularity);
    }
    return { from: periodRange?.from ?? null, to: periodRange?.to ?? null };
  }, [detailScope, granularity, periodRange]);

  const queryStatuses = detailScope && detailScope.group !== 'all'
    ? [...APPOINTMENT_STATUS_GROUP_VALUES[detailScope.group]]
    : null;

  const appointmentsQuery = useAppointmentMetricsInfiniteQuery({
    serviceId: serviceId ?? '',
    enabled: Boolean(serviceId && detailScope),
    from: queryRange.from,
    to: queryRange.to,
    statuses: queryStatuses,
  });

  const queriedAppointments = useMemo(
    () => (appointmentsQuery.data?.pages ?? []).flatMap((page) => page.items ?? []) as CompletedAppointmentDetail[],
    [appointmentsQuery.data],
  );

  const selectedAppointments = serviceId ? queriedAppointments : (appointments ?? []);

  const handleBarClick = (payload: unknown) => {
    const bucket =
      payload && typeof payload === 'object' && 'bucket' in payload
        ? String((payload as { bucket: unknown }).bucket)
        : null;
    if (!bucket) return;
    setDetailScope((prev) => (
      prev?.kind === 'bucket' && prev.bucket === bucket
        ? null
        : { kind: 'bucket', bucket, group: 'all' }
    ));
  };

  const openPeriodDetail = (group: AppointmentStatusGroupKey | 'all') => {
    setDetailScope({ kind: 'period', group });
  };

  const handleDownload = () => {
    const granLabel = GRANULARITY_LABEL[granularity];
    void downloadWorkbook(`agendamientos-por-estado-${granularity}.xlsx`, (wb) => {
      addStyledSheet(wb, {
        name: 'Serie',
        title: 'Agendamientos por estado',
        subtitle: `Citas agrupadas por ${granLabel.toLowerCase()} y estado.`,
        meta: [
          excelGeneratedAtLine(),
          `Granularidad: ${granLabel}`,
          `Total en vista: ${formatInt(viewTotals.total)}`,
          `Tasa de finalización: ${viewRate}%`,
        ],
        columns: [
          { header: 'Periodo', type: 'text' },
          { header: 'Total', type: 'int' },
          { header: 'Completados', type: 'int' },
          { header: 'Agendados', type: 'int' },
          { header: 'En ejecución', type: 'int' },
          { header: 'Cancelados', type: 'int' },
          { header: 'Rechazados', type: 'int' },
          { header: 'Tasa %', type: 'percent' },
          { header: 'En curso', type: 'text' },
        ],
        rows: chartData.map((row) => [
          row.label,
          row.total,
          row.completed,
          row.stackedScheduled,
          row.stackedInProgress,
          row.canceled,
          row.rejected,
          row.completionRate,
          row.isPartial ? 'Sí' : 'No',
        ]),
      });
    });
  };

  const handleDrillDownDownload = async () => {
    const rowsSource = serviceId
      ? await listAllAppointmentMetrics({
        serviceId,
        from: queryRange.from,
        to: queryRange.to,
        statuses: queryStatuses,
      }) as CompletedAppointmentDetail[]
      : selectedAppointments;
    void downloadWorkbook(`agendamientos-${detailScope?.bucket ?? 'periodo'}.xlsx`, (wb) => {
      addStyledSheet(wb, {
        name: 'Citas',
        title: `Agendamientos · ${selectedRow?.label ?? 'periodo'}`,
        subtitle: `${formatInt(rowsSource.length)} cita(s) en el recorte seleccionado.`,
        meta: [excelGeneratedAtLine()],
        columns: [
          { header: 'Fecha / hora', type: 'datetime' },
          { header: 'Estado', type: 'text' },
          { header: 'Cliente', type: 'text' },
          { header: 'Teléfono', type: 'text' },
          { header: 'Profesional', type: 'text' },
          { header: 'Duración (min)', type: 'int' },
          { header: 'Monto', type: 'currency' },
          { header: 'Pagado', type: 'currency' },
          { header: 'Pendiente', type: 'currency' },
          { header: 'Estado pago', type: 'text' },
          { header: 'Dirección', type: 'text' },
          { header: 'ID', type: 'text' },
        ],
        rows: rowsSource.map((appt) => [
          new Date(appt.scheduledDate),
          appointmentStatusLabel(appt.status),
          appt.clientName ?? '',
          appt.clientPhone ?? '',
          appt.providerName ?? '',
          appt.duration ?? null,
          appt.totalAmount ?? null,
          appt.paidAmount ?? null,
          appt.pendingAmount ?? null,
          formatPaymentStatus(appt.paymentStatus),
          appt.addressLine ?? '',
          appt.id,
        ]),
      });
    });
  };

  return (
    <MetricsSection
      title="¿Cómo se componen los agendamientos por estado?"
      subtitle="El total de cada barra es todo lo agendado en el periodo. La línea sigue los completados."
      granularity={granularity}
      onGranularityChange={handleGranularityChange}
      onDownload={handleDownload}
      downloadLabel="Descargar Excel"
      detail={
        <TableContainer>
          <Table size="small" data-testid="appointments-status-table">
            <TableHead>
              <TableRow>
                <TableCell>Periodo</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Completados</TableCell>
                <TableCell align="right">Agendados</TableCell>
                <TableCell align="right">En ejecución</TableCell>
                <TableCell align="right">Cancelados</TableCell>
                <TableCell align="right">Rechazados</TableCell>
                <TableCell align="right">Tasa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {chartData.map((row) => (
                <TableRow key={row.bucket} hover>
                  <TableCell>
                    {row.label}
                    {row.isPartial && (
                      <Chip
                        size="small"
                        label="en curso"
                        variant="outlined"
                        sx={{ ml: 1, height: 18, fontSize: 10 }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">{formatInt(row.total)}</TableCell>
                  <TableCell align="right">{formatInt(row.completed)}</TableCell>
                  <TableCell align="right">{formatInt(row.stackedScheduled)}</TableCell>
                  <TableCell align="right">{formatInt(row.stackedInProgress)}</TableCell>
                  <TableCell align="right">{formatInt(row.canceled)}</TableCell>
                  <TableCell align="right">{formatInt(row.rejected)}</TableCell>
                  <TableCell align="right">{`${row.completionRate}%`}</TableCell>
                </TableRow>
              ))}
              {chartData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    Sin agendamientos en este recorte
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      }
    >
      <MetricsContextBanner summary="Ventana y fecha de corte de agendamientos">
        El periodo filtra la serie ya cargada. Las comparativas de crecimiento siguen midiendo
        solo citas COMPLETED; el total, la composición y la tasa usan todos los estados.
      </MetricsContextBanner>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          color="primary"
          label={`Total agendado: ${formatInt(viewTotals.total)}`}
          onClick={() => openPeriodDetail('all')}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Completados: ${formatInt(viewGroups.completed)}`}
          onClick={() => openPeriodDetail('completed')}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Aún no completados: ${formatInt(viewGroups.scheduled + viewGroups.inProgress)}`}
          onClick={() => openPeriodDetail('scheduled')}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Cancelados: ${formatInt(viewGroups.canceled)}`}
          onClick={() => openPeriodDetail('canceled')}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Tasa de finalización: ${viewRate}%`}
          onClick={() => openPeriodDetail('all')}
        />
      </Stack>

      {comparisonLenses.length > 0 && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {comparisonLenses.map((lens) => (
            <Grid item xs={12} sm={6} md={3} key={lens.key}>
              <ComparisonCard lens={lens} />
            </Grid>
          ))}
        </Grid>
      )}

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Cargando agendamientos…
        </Typography>
      ) : chartData.length === 0 || viewTotals.total === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Sin agendamientos en el recorte seleccionado.
        </Typography>
      ) : (
        <Box sx={{ width: '100%', height: 340 }} data-testid="appointments-status-chart">
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <BarGradient id="statusCompleted" color={completedColor} />
                <BarGradient id="statusScheduled" color={scheduledColor} />
                <BarGradient id="statusRunning" color={runningColor} />
                <BarGradient id="statusCanceled" color={canceledColor} />
                <BarGradient id="statusRejected" color={rejectedColor} />
              </defs>
              <CartesianGrid
                vertical={false}
                stroke={chartGridStroke(theme)}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tick={chartAxisTick(theme)}
                tickLine={false}
                axisLine={{ stroke: chartGridStroke(theme) }}
              />
              <YAxis
                allowDecimals={false}
                width={40}
                tick={chartAxisTick(theme)}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisInt}
              />
              <Tooltip
                content={<StatusChartTooltip />}
                cursor={{ fill: alpha(theme.palette.text.primary, 0.05) }}
              />
              <Legend />
              <Bar
                dataKey="completed"
                name="Completados"
                stackId="status"
                fill="url(#statusCompleted)"
                cursor="pointer"
                maxBarSize={64}
                onClick={handleBarClick}
                isAnimationActive={false}
              />
              <Bar
                dataKey="stackedScheduled"
                name="Agendados"
                stackId="status"
                fill="url(#statusScheduled)"
                cursor="pointer"
                maxBarSize={64}
                onClick={handleBarClick}
                isAnimationActive={false}
              />
              <Bar
                dataKey="stackedInProgress"
                name="En ejecución"
                stackId="status"
                fill="url(#statusRunning)"
                cursor="pointer"
                maxBarSize={64}
                onClick={handleBarClick}
                isAnimationActive={false}
              />
              <Bar
                dataKey="canceled"
                name="Cancelados"
                stackId="status"
                fill="url(#statusCanceled)"
                cursor="pointer"
                maxBarSize={64}
                onClick={handleBarClick}
                isAnimationActive={false}
              />
              <Bar
                dataKey="rejected"
                name="Rechazados"
                stackId="status"
                fill="url(#statusRejected)"
                radius={[6, 6, 0, 0]}
                cursor="pointer"
                maxBarSize={64}
                onClick={handleBarClick}
                isAnimationActive={false}
              >
                <LabelList dataKey="total" position="top" fontSize={11} />
              </Bar>
              <Line
                type="monotone"
                dataKey="completed"
                name="Completados"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      )}

      {detailScope && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 1.5 }} />
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 1 }}
          >
            <Typography variant="subtitle2">
              {selectedRow?.label ?? 'Periodo seleccionado'}
              {selectedRow?.isPartial ? ' (en curso)' : ''} ·{' '}
              {formatInt(selectedAppointments.length)}{' '}
              {selectedAppointments.length === 1 ? 'cita' : 'citas'}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={() => void handleDrillDownDownload()}>
                Descargar Excel
              </Button>
              <Button
                size="small"
                startIcon={<CloseIcon />}
                onClick={() => setDetailScope(null)}
              >
                Limpiar
              </Button>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
            {(['all', 'scheduled', 'inProgress', 'completed', 'canceled', 'rejected'] as const).map((group) => (
              <Chip
                key={group}
                size="small"
                color={detailScope.group === group ? 'primary' : 'default'}
                variant={detailScope.group === group ? 'filled' : 'outlined'}
                label={group === 'all' ? 'Todos' : APPOINTMENT_GROUP_LABELS[group]}
                onClick={() => setDetailScope((prev) => (prev ? { ...prev, group } : prev))}
              />
            ))}
          </Stack>

          {appointmentsQuery.isError && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              No se pudo cargar el detalle de agendamientos.
            </Alert>
          )}

          {selectedAppointments.length === 0 && !appointmentsQuery.isFetching ? (
            <Typography variant="body2" color="text.secondary">
              No hay citas para este recorte y filtro.
            </Typography>
          ) : (
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha / hora</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Teléfono</TableCell>
                    <TableCell>Profesional</TableCell>
                    <TableCell align="right">Duración</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell>Pago</TableCell>
                    <TableCell>ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedAppointments.map((appt) => (
                    <TableRow key={appt.id} hover>
                      <TableCell>{formatDateTime(appt.scheduledDate)}</TableCell>
                      <TableCell>{appointmentStatusLabel(appt.status)}</TableCell>
                      <TableCell>{appt.clientName ?? '—'}</TableCell>
                      <TableCell>{appt.clientPhone ?? '—'}</TableCell>
                      <TableCell>{appt.providerName ?? '—'}</TableCell>
                      <TableCell align="right">{formatDuration(appt.duration)}</TableCell>
                      <TableCell align="right">{formatCurrency(appt.totalAmount)}</TableCell>
                      <TableCell>
                        <MuiTooltip
                          title={
                            appt.pendingAmount && appt.pendingAmount > 0
                              ? `Pendiente: ${formatCurrency(appt.pendingAmount)}`
                              : ''
                          }
                        >
                          <span>{formatPaymentStatus(appt.paymentStatus)}</span>
                        </MuiTooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {appt.id}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {appointmentsQuery.hasNextPage && (
            <Button
              size="small"
              sx={{ mt: 1 }}
              onClick={() => void appointmentsQuery.fetchNextPage()}
              disabled={appointmentsQuery.isFetchingNextPage}
            >
              {appointmentsQuery.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </Box>
      )}
    </MetricsSection>
  );
};

export default CompletedServicesSection;
