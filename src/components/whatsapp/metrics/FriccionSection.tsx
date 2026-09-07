import React, { useMemo } from 'react';
import {
  Box,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ClientQualityMetrics } from '@/types/whatsapp';
import { ChartTooltipCard, chartAxisTick, chartGridStroke } from './utils/chartTheme';
import MetricsChartFrame from './shared/MetricsChartFrame';
import MetricsContextBanner from './shared/MetricsContextBanner';
import MetricsDataTable from './shared/MetricsDataTable';
import MetricsKpiCard from './shared/MetricsKpiCard';
import MetricsKpiGrid from './shared/MetricsKpiGrid';
import MetricsPageState from './shared/MetricsPageState';
import MetricsViewHeader from './shared/MetricsViewHeader';
import {
  formatMetricInt,
  formatMetricPct,
  metricsPalette,
  safeRate,
} from './shared/metricsTheme';

interface FriccionSectionProps {
  metrics?: ClientQualityMetrics;
  loading: boolean;
  error?: string | null;
  updatedAt?: number;
  onRetry?: () => void;
}

const FriccionSection: React.FC<FriccionSectionProps> = ({
  metrics,
  loading,
  error,
  updatedAt,
  onRetry,
}) => {
  const theme = useTheme();
  const palette = metricsPalette(theme);
  const nucleus = metrics?.nucleusSize ?? 0;

  const paymentData = useMemo(() => {
    if (!metrics) return [];
    return [
      { label: 'Pago pendiente', count: metrics.cancellations.pagoPendiente, color: palette.warning },
      { label: 'Pago aceptado', count: metrics.cancellations.pagoAceptado, color: palette.favorite },
      { label: 'En proceso', count: metrics.cancellations.pagoEnProceso, color: palette.recurring },
    ].filter((row) => row.count > 0);
  }, [metrics, palette]);

  const crossData = useMemo(
    () =>
      (metrics?.crossCancel ?? [])
        .map((row) => ({
          ...row,
          rate: safeRate(row.withCanceled, row.total),
          evidence: `${formatMetricInt(row.withCanceled)} / ${formatMetricInt(row.total)}`,
        }))
        .toSorted((a, b) => b.rate - a.rate),
    [metrics?.crossCancel],
  );

  const highestFriction = crossData[0];

  return (
    <MetricsPageState
      loading={loading}
      error={error}
      empty={!metrics || nucleus === 0}
      onRetry={onRetry}
      emptyTitle="Aún no hay fricción que analizar"
    >
      {metrics ? (
        <>
          <MetricsViewHeader
            title="Fricción y cancelaciones"
            purpose="Separa cancelación operativa, señales CRM y estados de pago para evitar confundir fricción con pérdida."
            periodLabel={
              metrics.period.from || metrics.period.to
                ? `${metrics.period.from ?? 'Inicio'} – ${metrics.period.to ?? 'Hoy'}`
                : 'Histórico completo'
            }
            universeLabel={`${formatMetricInt(nucleus)} clientes completados`}
            updatedAt={updatedAt}
            insights={[
              {
                label: 'Clientes con cancelación',
                value: `${formatMetricPct(metrics.cancellations.clientsWithCanceledPct)}`,
                detail: `${formatMetricInt(metrics.cancellations.clientsWithCanceled)} de ${formatMetricInt(nucleus)}`,
                tone: 'warning',
              },
              {
                label: 'Cancelaciones registradas',
                value: formatMetricInt(metrics.cancellations.canceledBookings),
                detail: 'Citas, no clientes únicos',
              },
              {
                label: 'Mayor tasa por capa',
                value: highestFriction
                  ? `${highestFriction.label} · ${formatMetricPct(highestFriction.rate)}`
                  : 'Sin casos',
                detail: highestFriction?.evidence,
                tone: 'risk',
              },
            ]}
          />

          <MetricsContextBanner summary="Cómo leer la fricción sin confundirla con churn">
            Cancelar no equivale a perder un cliente: una persona puede tener citas canceladas y
            servicios completados. Decline es un tag comercial, no un estado de pago; refunds no
            existen en bookings; Parar es opt-out de jornadas empresa y Bloqueado también puede
            corresponder a consultas de empleo.
          </MetricsContextBanner>

          <Box sx={{ mb: 2 }}>
            <MetricsKpiGrid minWidth={210}>
              <MetricsKpiCard
                label="Con al menos una cancelación"
                value={formatMetricPct(metrics.cancellations.clientsWithCanceledPct)}
                detail={`${formatMetricInt(metrics.cancellations.clientsWithCanceled)} clientes`}
                accent={palette.warning}
              />
              <MetricsKpiCard
                label="Sin cancelaciones"
                value={formatMetricPct(
                  safeRate(
                    nucleus - metrics.cancellations.clientsWithCanceled,
                    nucleus,
                  ),
                )}
                detail={`${formatMetricInt(
                  nucleus - metrics.cancellations.clientsWithCanceled,
                )} clientes`}
                accent={palette.favorite}
              />
            </MetricsKpiGrid>
          </Box>

          <MetricsChartFrame
            title="¿Qué capa concentra una mayor tasa de cancelación?"
            description="La comparación está normalizada por el tamaño de cada capa."
            unit="% de clientes de la capa con ≥1 cancelación"
            summary={
              highestFriction
                ? `${highestFriction.label} presenta ${formatMetricPct(highestFriction.rate)} (${highestFriction.evidence}).`
                : 'No hay cancelaciones en las capas analizadas.'
            }
            height={260}
            dataTable={
              <MetricsDataTable
                ariaLabel="Tasas de cancelación por capa"
                maxHeight={280}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Capa</TableCell>
                    <TableCell align="right">Con cancelación</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Tasa</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {crossData.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell align="right">{formatMetricInt(row.withCanceled)}</TableCell>
                      <TableCell align="right">{formatMetricInt(row.total)}</TableCell>
                      <TableCell align="right">{formatMetricPct(row.rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </MetricsDataTable>
            }
          >
            <ResponsiveContainer>
              <BarChart
                data={crossData}
                layout="vertical"
                margin={{ top: 4, right: 62, left: 16, bottom: 4 }}
              >
                <CartesianGrid stroke={chartGridStroke(theme)} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={chartAxisTick(theme)}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={112}
                  tick={chartAxisTick(theme)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const row = payload[0].payload as (typeof crossData)[number];
                    return (
                      <ChartTooltipCard
                        title={row.label}
                        rows={[
                          { label: 'Tasa', value: formatMetricPct(row.rate) },
                          { label: 'Evidencia', value: row.evidence },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="rate" fill={palette.risk} radius={[0, 5, 5, 0]} isAnimationActive={false}>
                  <LabelList
                    dataKey="rate"
                    position="right"
                    fill={theme.palette.text.primary}
                    formatter={(value) =>
                      typeof value === 'number' ? `${value.toLocaleString('es-CO')}%` : ''
                    }
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </MetricsChartFrame>

          <MetricsChartFrame
            title="¿Qué estado de pago tienen las citas canceladas?"
            description="Conteo de bookings cancelados; no representa clientes únicos."
            unit="citas canceladas"
            summary={`${formatMetricInt(metrics.cancellations.pagoPendiente)} cancelaciones permanecen con pago pendiente.`}
            height={230}
          >
            <ResponsiveContainer>
              <BarChart data={paymentData} margin={{ top: 8, right: 20, left: 4, bottom: 8 }}>
                <CartesianGrid stroke={chartGridStroke(theme)} vertical={false} />
                <XAxis dataKey="label" tick={chartAxisTick(theme)} />
                <YAxis tick={chartAxisTick(theme)} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const row = payload[0].payload as (typeof paymentData)[number];
                    return (
                      <ChartTooltipCard
                        title={row.label}
                        rows={[{ label: 'Citas', value: formatMetricInt(row.count) }]}
                      />
                    );
                  }}
                />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} isAnimationActive={false}>
                  {paymentData.map((row) => (
                    <Cell key={row.label} fill={row.color} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="top"
                    fill={theme.palette.text.primary}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </MetricsChartFrame>

          <Typography variant="caption" color="text.secondary">
            No se presenta `cancellation_fee` como conclusión: no existe un motivo estructurado y
            el valor histórico observado era cero.
          </Typography>
        </>
      ) : null}
    </MetricsPageState>
  );
};

export default FriccionSection;
