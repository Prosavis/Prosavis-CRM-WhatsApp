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
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CompletedAppointmentDetail,
  CompletedServicesTimeseriesPoint,
  MetricsGranularSeries,
  WhatsAppMetrics,
} from '@/types/whatsapp';
import {
  currentBucketKeyForToday,
  filterAppointmentsToBucket,
  labelCompletedSeries,
  type MetricsGranularity,
} from './utils/aggregateBuckets';
import {
  addStyledSheet,
  downloadWorkbook,
  excelGeneratedAtLine,
} from './utils/exportMetricsExcel';
import {
  AreaGradient,
  BarGradient,
  ChartTooltipCard,
  chartAxisTick,
  chartColor,
  chartGridStroke,
  formatAxisInt,
} from './utils/chartTheme';
import MetricsSection from './MetricsSection';

const GRANULARITY_LABEL: Record<MetricsGranularity, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
};

interface CompletedServicesSectionProps {
  series?: MetricsGranularSeries<CompletedServicesTimeseriesPoint>;
  appointments?: CompletedAppointmentDetail[];
  meta?: WhatsAppMetrics['completedMeta'];
  loading: boolean;
}

function formatInt(n: number): string {
  return n.toLocaleString('es-CO');
}

function formatDay(isoDay: string | null | undefined): string {
  if (!isoDay) return '—';
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
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

/** Una "lente" de comparación honesta: actual vs previo con su explicación. */
interface ComparisonLens {
  key: string;
  title: string;
  current: number;
  previous: number;
  growth: number | null;
  explanation: string;
  /** Fuerza color neutro (p. ej. la lente de periodo en curso parcial). */
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
        ? theme.palette.success.main
        : theme.palette.error.main;
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
        sx={{ mt: 'auto', pt: 0.5, lineHeight: 1.35, opacity: 0.85 }}
      >
        {lens.explanation}
      </Typography>
    </Box>
  );
};

interface CompletedChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { label: string; completed: number; isPartial: boolean } }>;
}

const CompletedChartTooltip: React.FC<CompletedChartTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <ChartTooltipCard
      title={`${point.label}${point.isPartial ? ' (en curso)' : ''}`}
      rows={[{ label: 'Completados', value: formatInt(point.completed), color: '#2e7d32' }]}
      hint="Clic para ver citas"
    />
  );
};

const CompletedServicesSection: React.FC<CompletedServicesSectionProps> = ({
  series,
  appointments,
  meta,
  loading,
}) => {
  const theme = useTheme();
  const [granularity, setGranularity] = useState<MetricsGranularity>('month');
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const handleGranularityChange = (next: MetricsGranularity) => {
    setGranularity(next);
    setSelectedBucket(null);
  };

  const currentBucketKey = useMemo(
    () => currentBucketKeyForToday(granularity, meta?.today),
    [granularity, meta?.today],
  );

  const data = useMemo(() => {
    if (!series) return [];
    // Ventana fija ~6 meses del edge (no recortar al periodo global de 30d)
    return labelCompletedSeries(series[granularity] ?? [], granularity, currentBucketKey);
  }, [series, granularity, currentBucketKey]);

  const chartData = useMemo(() => {
    if (granularity === 'day') return data;
    // Semana/mes: ocultar ceros al inicio/fin para legibilidad, conservar huecos internos
    const first = data.findIndex((r) => r.completed > 0);
    if (first < 0) return data;
    let last = data.length - 1;
    while (last > first && data[last].completed === 0) last -= 1;
    return data.slice(first, last + 1);
  }, [data, granularity]);

  const totalInView = useMemo(
    () => chartData.reduce((sum, row) => sum + row.completed, 0),
    [chartData],
  );

  const comparisons = meta?.comparisons;

  const barColor = chartColor(theme, '#2e7d32');
  const barSelectedColor = chartColor(theme, '#1b5e20', 0.22);
  const trendColor = chartColor(theme, '#1565c0');

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
          'Los días transcurridos de este mes vs los mismos días del mes anterior.',
      });
      lenses.push({
        key: 'rolling30d',
        title: 'Últimos 30 días',
        current: comparisons.rolling30d.current,
        previous: comparisons.rolling30d.previous,
        growth: comparisons.rolling30d.growth,
        explanation: 'Los últimos 30 días vs los 30 días inmediatamente previos.',
      });
      if (comparisons.lastClosedMonth) {
        lenses.push({
          key: 'lastClosedMonth',
          title: `Último mes cerrado (${shortMonthLabel(comparisons.lastClosedMonth.month)})`,
          current: comparisons.lastClosedMonth.current,
          previous: comparisons.lastClosedMonth.previous,
          growth: comparisons.lastClosedMonth.growth,
          explanation:
            'El último mes completo vs el mes cerrado anterior — periodos completos, plenamente comparables.',
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
          'Compara el periodo en curso (parcial) vs el anterior según la granularidad; puede exagerar caídas/subidas — es otra forma de leer los mismos datos.',
      });
    }
    return lenses;
  }, [comparisons, chartData]);

  const renderBarLabel = (props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    value?: number | string | boolean | null;
  }): React.ReactElement => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const value = Number(props.value ?? 0);
    if (!value || width < 22) return <g />;
    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={theme.palette.text.secondary}
      >
        {formatInt(value)}
      </text>
    );
  };

  const selectedRow = useMemo(
    () => chartData.find((row) => row.bucket === selectedBucket) ?? null,
    [chartData, selectedBucket],
  );

  const selectedAppointments = useMemo(() => {
    if (!selectedBucket || !appointments) return [];
    return filterAppointmentsToBucket(appointments, selectedBucket, granularity);
  }, [appointments, selectedBucket, granularity]);

  const handleBarClick = (payload: unknown) => {
    const bucket =
      payload && typeof payload === 'object' && 'bucket' in payload
        ? String((payload as { bucket: unknown }).bucket)
        : null;
    if (!bucket) return;
    setSelectedBucket((prev) => (prev === bucket ? null : bucket));
  };

  const handleDownload = () => {
    const granLabel = GRANULARITY_LABEL[granularity];
    void downloadWorkbook(`servicios-completados-${granularity}.xlsx`, (wb) => {
      addStyledSheet(wb, {
        name: 'Serie',
        title: 'Servicios completados',
        subtitle: `Citas COMPLETED agrupadas por ${granLabel.toLowerCase()} (ventana de 6 meses).`,
        meta: [
          excelGeneratedAtLine(),
          `Granularidad: ${granLabel}`,
          `Total en vista: ${formatInt(totalInView)}`,
        ],
        columns: [
          { header: 'Periodo', type: 'text' },
          { header: 'Completados', type: 'int' },
          { header: 'Crecimiento %', type: 'percent' },
          { header: 'En curso', type: 'text' },
        ],
        rows: chartData.map((row) => [
          row.label,
          row.completed,
          row.growth,
          row.isPartial ? 'Sí' : 'No',
        ]),
      });
      if (comparisonLenses.length > 0) {
        addStyledSheet(wb, {
          name: 'Comparaciones',
          title: 'Comparaciones',
          subtitle:
            'Distintas lentes honestas para leer la evolución de servicios completados.',
          meta: [excelGeneratedAtLine()],
          columns: [
            { header: 'Lente', type: 'text' },
            { header: 'Actual', type: 'int' },
            { header: 'Previo', type: 'int' },
            { header: 'Variación %', type: 'percent' },
            { header: 'Qué mide', type: 'text', width: 62 },
          ],
          rows: comparisonLenses.map((lens) => [
            lens.title,
            lens.current,
            lens.previous,
            lens.growth,
            lens.explanation,
          ]),
        });
      }
    });
  };

  const handleDrillDownDownload = () => {
    if (!selectedRow) return;
    const rows = selectedAppointments.map((appt) => [
      new Date(appt.scheduledDate),
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
    ]);
    void downloadWorkbook(`citas-${selectedRow.bucket}.xlsx`, (wb) => {
      addStyledSheet(wb, {
        name: 'Citas',
        title: `Citas completadas · ${selectedRow.label}`,
        subtitle: `${formatInt(
          selectedAppointments.length,
        )} cita(s) COMPLETED en el periodo seleccionado.`,
        meta: [excelGeneratedAtLine()],
        columns: [
          { header: 'Fecha / hora', type: 'datetime' },
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
        rows,
      });
    });
  };

  return (
    <MetricsSection
      title="Servicios completados"
      subtitle="Citas COMPLETED en Firestore appointments, agrupadas por scheduledDate (America/Bogota). Ventana fija de 6 meses — independiente del filtro «Periodo» de arriba. Clic en una barra para ver las citas."
      granularity={granularity}
      onGranularityChange={handleGranularityChange}
      onDownload={handleDownload}
      downloadLabel="Descargar Excel"
      detail={
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Periodo</TableCell>
                <TableCell align="right">Completados</TableCell>
                <TableCell align="right">Variación</TableCell>
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
                  <TableCell align="right">{formatInt(row.completed)}</TableCell>
                  <TableCell align="right">
                    {row.isPartial ? (
                      <MuiTooltip title="Periodo incompleto: la variación no es comparable con periodos cerrados.">
                        <span>parcial</span>
                      </MuiTooltip>
                    ) : row.growth == null ? (
                      '—'
                    ) : (
                      `${row.growth}%`
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {chartData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    Sin servicios completados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      }
    >
      {meta && (
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`Total 6 meses: ${formatInt(meta.totalCompleted)}`} />
          <Chip
            size="small"
            variant="outlined"
            label={`En periodo del filtro: ${formatInt(meta.inSelectedPeriod)}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Última COMPLETED: ${formatDay(meta.lastCompletedDate)}`}
          />
        </Stack>
      )}

      {meta && meta.inSelectedPeriod === 0 && meta.totalCompleted > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          No hay citas COMPLETED con <code>scheduledDate</code> en el periodo del filtro
          superior. El gráfico muestra la ventana de 6 meses (última:{' '}
          {formatDay(meta.lastCompletedDate)}).
        </Alert>
      )}

      {!loading && chartData.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Completados en vista: <strong>{formatInt(totalInView)}</strong>
        </Typography>
      )}

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
          Cargando servicios completados…
        </Typography>
      ) : chartData.length === 0 || totalInView === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Sin citas completadas en los últimos 6 meses según{' '}
          <code>Firestore appointments.scheduledDate</code>.
        </Typography>
      ) : (
        <Box sx={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <BarGradient id="completedBar" color={barColor} />
                <BarGradient id="completedBarSelected" color={barSelectedColor} from={1} to={0.72} />
                <AreaGradient id="completedTrend" color={trendColor} />
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
                content={<CompletedChartTooltip />}
                cursor={{ fill: alpha(theme.palette.text.primary, 0.05) }}
              />
              <Area
                type="monotone"
                dataKey="completed"
                name="Tendencia"
                stroke={trendColor}
                strokeWidth={2}
                fill="url(#completedTrend)"
                dot={false}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
              <Bar
                dataKey="completed"
                name="Completados"
                radius={[6, 6, 0, 0]}
                cursor="pointer"
                maxBarSize={64}
                onClick={handleBarClick}
                animationDuration={800}
              >
                {chartData.map((row) => (
                  <Cell
                    key={row.bucket}
                    fill={
                      row.bucket === selectedBucket
                        ? 'url(#completedBarSelected)'
                        : 'url(#completedBar)'
                    }
                    fillOpacity={
                      selectedBucket && row.bucket !== selectedBucket ? 0.4 : 1
                    }
                    stroke={row.bucket === selectedBucket ? barSelectedColor : 'transparent'}
                    strokeWidth={row.bucket === selectedBucket ? 1.5 : 0}
                  />
                ))}
                <LabelList dataKey="completed" content={renderBarLabel} />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      )}

      {selectedRow && (
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
              {selectedRow.label}
              {selectedRow.isPartial ? ' (en curso)' : ''} ·{' '}
              {formatInt(selectedAppointments.length)}{' '}
              {selectedAppointments.length === 1 ? 'cita' : 'citas'}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleDrillDownDownload}
                disabled={selectedAppointments.length === 0}
              >
                Descargar Excel
              </Button>
              <Button
                size="small"
                startIcon={<CloseIcon />}
                onClick={() => setSelectedBucket(null)}
              >
                Limpiar
              </Button>
            </Stack>
          </Stack>

          {selectedAppointments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No hay detalle de citas para este periodo. (El detalle requiere volver a cargar las
              métricas tras el despliegue del edge.)
            </Typography>
          ) : (
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha / hora</TableCell>
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
        </Box>
      )}
    </MetricsSection>
  );
};

export default CompletedServicesSection;
