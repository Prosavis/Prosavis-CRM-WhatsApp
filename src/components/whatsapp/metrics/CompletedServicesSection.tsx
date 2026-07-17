import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
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
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import CloseIcon from '@mui/icons-material/Close';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CompletedAppointmentDetail,
  CompletedComparison,
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
import { downloadCsv } from './utils/exportMetricsCsv';
import MetricsSection from './MetricsSection';

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

interface ComparisonChipProps {
  title: string;
  comparison: CompletedComparison;
  detail: string;
}

const ComparisonChip: React.FC<ComparisonChipProps> = ({ title, comparison, detail }) => {
  const { growth } = comparison;
  const hasGrowth = growth != null;
  const positive = hasGrowth && growth >= 0;
  const icon = !hasGrowth ? (
    <TrendingFlatIcon />
  ) : positive ? (
    <TrendingUpIcon />
  ) : (
    <TrendingDownIcon />
  );
  const growthText = hasGrowth ? `${positive ? '+' : ''}${growth}%` : 's/d';
  return (
    <MuiTooltip title={detail}>
      <Chip
        size="small"
        icon={icon}
        color={!hasGrowth ? 'default' : positive ? 'success' : 'error'}
        variant={hasGrowth ? 'filled' : 'outlined'}
        label={`${title}: ${growthText}`}
      />
    </MuiTooltip>
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
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
        boxShadow: 2,
      }}
    >
      <Typography variant="body2" fontWeight={600}>
        {point.label}
        {point.isPartial ? ' (en curso)' : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Completados: <strong>{formatInt(point.completed)}</strong>
      </Typography>
      <Typography variant="caption" color="primary.main">
        Clic para ver citas
      </Typography>
    </Box>
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
  const latestGrowth =
    chartData.length > 0 ? chartData[chartData.length - 1].growth : null;

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
    downloadCsv(
      `servicios-completados-${granularity}.csv`,
      ['periodo', 'completados', 'crecimiento_pct', 'en_curso'],
      chartData.map((row) => [
        row.bucket,
        row.completed,
        row.growth ?? '',
        row.isPartial ? 'si' : 'no',
      ]),
    );
  };

  const handleDrillDownDownload = () => {
    if (!selectedRow) return;
    downloadCsv(
      `citas-completadas-${selectedRow.bucket}.csv`,
      [
        'fecha_hora',
        'cliente',
        'telefono',
        'profesional',
        'duracion_min',
        'monto',
        'pagado',
        'pendiente',
        'estado_pago',
        'direccion',
        'id',
      ],
      selectedAppointments.map((appt) => [
        formatDateTime(appt.scheduledDate),
        appt.clientName ?? '',
        appt.clientPhone ?? '',
        appt.providerName ?? '',
        appt.duration ?? '',
        appt.totalAmount ?? '',
        appt.paidAmount ?? '',
        appt.pendingAmount ?? '',
        appt.paymentStatus ?? '',
        appt.addressLine ?? '',
        appt.id,
      ]),
    );
  };

  return (
    <MetricsSection
      title="Servicios completados"
      subtitle="Citas COMPLETED en Firestore appointments, agrupadas por scheduledDate (America/Bogota). Ventana fija de 6 meses — independiente del filtro «Periodo» de arriba. Clic en una barra para ver las citas."
      granularity={granularity}
      onGranularityChange={handleGranularityChange}
      onDownload={handleDownload}
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

      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
        {comparisons ? (
          <>
            <ComparisonChip
              title="Mes a la fecha"
              comparison={comparisons.mtd}
              detail={`${formatInt(comparisons.mtd.current)} este mes vs ${formatInt(
                comparisons.mtd.previous,
              )} en los mismos días del mes anterior.`}
            />
            <ComparisonChip
              title="Últimos 30 días"
              comparison={comparisons.rolling30d}
              detail={`${formatInt(comparisons.rolling30d.current)} en los últimos 30 días vs ${formatInt(
                comparisons.rolling30d.previous,
              )} en los 30 días previos.`}
            />
            {comparisons.lastClosedMonth && (
              <ComparisonChip
                title={`Último mes cerrado (${shortMonthLabel(comparisons.lastClosedMonth.month)})`}
                comparison={comparisons.lastClosedMonth}
                detail={`${formatInt(comparisons.lastClosedMonth.current)} en ${shortMonthLabel(
                  comparisons.lastClosedMonth.month,
                )} vs ${formatInt(comparisons.lastClosedMonth.previous)} en el mes cerrado anterior.`}
              />
            )}
          </>
        ) : (
          latestGrowth != null && (
            <Chip
              size="small"
              icon={latestGrowth >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
              color={latestGrowth >= 0 ? 'success' : 'error'}
              label={`${latestGrowth >= 0 ? '+' : ''}${latestGrowth}% último periodo`}
            />
          )
        )}
        {!loading && chartData.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            Completados en vista: <strong>{formatInt(totalInView)}</strong>
          </Typography>
        )}
      </Stack>

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
        <Box sx={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip content={<CompletedChartTooltip />} cursor={{ fill: theme.palette.action.hover }} />
              <Bar
                dataKey="completed"
                name="Completados"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={handleBarClick}
              >
                {chartData.map((row) => (
                  <Cell
                    key={row.bucket}
                    fill={row.bucket === selectedBucket ? '#1b5e20' : '#2e7d32'}
                    fillOpacity={
                      selectedBucket && row.bucket !== selectedBucket ? 0.45 : 1
                    }
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="completed"
                name="Tendencia"
                stroke="#1565c0"
                strokeDasharray="4 4"
                dot={false}
                legendType="none"
              />
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
                Descargar CSV
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
