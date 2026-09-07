import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ClientQualityMetrics } from '@/types/whatsapp';
import MetricsSection from './MetricsSection';
import { ChartTooltipCard, chartAxisTick, chartGridStroke, formatAxisInt } from './utils/chartTheme';

interface FriccionSectionProps {
  metrics?: ClientQualityMetrics;
  loading: boolean;
  error?: string | null;
}

const FriccionSection: React.FC<FriccionSectionProps> = ({ metrics, loading, error }) => {
  const theme = useTheme();
  const nucleus = metrics?.nucleusSize ?? 0;
  const cancelPie = useMemo(() => {
    if (!metrics) return [];
    const withCanceled = metrics.cancellations.clientsWithCanceled;
    return [
      { key: 'with', label: '≥1 CANCELED', count: withCanceled, color: '#e64a19' },
      {
        key: 'without',
        label: 'Sin CANCELED',
        count: Math.max(0, nucleus - withCanceled),
        color: '#2e7d32',
      },
    ];
  }, [metrics, nucleus]);
  const paymentBars = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        key: 'pendiente',
        label: 'PAGO_PENDIENTE',
        count: metrics.cancellations.pagoPendiente,
        color: '#fb8c00',
      },
      {
        key: 'aceptado',
        label: 'PAGO_ACEPTADO',
        count: metrics.cancellations.pagoAceptado,
        color: '#43a047',
      },
      {
        key: 'proceso',
        label: 'PAGO_EN_PROCESO',
        count: metrics.cancellations.pagoEnProceso,
        color: '#5c6bc0',
      },
    ];
  }, [metrics]);
  const crossData = useMemo(
    () =>
      (metrics?.crossCancel ?? []).map((row) => ({
        ...row,
        labelFull: `${row.label} (${row.withCanceled}/${row.total})`,
      })),
    [metrics],
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={0}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 2 }}>
        Cancelar no es cliente perdido: muchos siguen con COMPLETED. El tag CRM no es espejo 1:1
        del status. En bookings no existen declined ni refund; las devoluciones viven en fichas /
        WhatsApp. Decline (tag) es el proxy de fricción de venta. Parar es opt-out de jornadas
        empresas, distinto de Decline residencial. Bloqueado a veces es Job/vacantes.
      </Alert>

      <MetricsSection
        title={`Cancelaciones en el núcleo COMPLETED (N=${nucleus})`}
        subtitle={
          metrics
            ? `${metrics.cancellations.clientsWithCanceled} clientes (${metrics.cancellations.clientsWithCanceledPct}%) tienen ≥1 CANCELED · ${metrics.cancellations.canceledBookings} cancelaciones en total`
            : undefined
        }
        defaultExpanded
      >
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={cancelPie} dataKey="count" nameKey="label" innerRadius={54} outerRadius={90}>
                {cancelPie.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as (typeof cancelPie)[number];
                  return (
                    <ChartTooltipCard
                      title={row.label}
                      rows={[{ label: 'Clientes', value: String(row.count) }]}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </MetricsSection>

      <MetricsSection
        title="Pago en las cancelaciones del núcleo"
        subtitle="cancellation_fee no se muestra: en el estudio histórico era $0 y no hay columna de motivo."
        defaultExpanded
      >
        <Box sx={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={paymentBars}>
              <CartesianGrid stroke={chartGridStroke(theme)} vertical={false} />
              <XAxis dataKey="label" tick={chartAxisTick(theme)} />
              <YAxis tick={chartAxisTick(theme)} allowDecimals={false} tickFormatter={formatAxisInt} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as (typeof paymentBars)[number];
                  return (
                    <ChartTooltipCard
                      title={row.label}
                      rows={[{ label: 'Bookings CANCELED', value: String(row.count) }]}
                    />
                  );
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {paymentBars.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </MetricsSection>

      <MetricsSection
        title="Cruce calidad × cancelación"
        subtitle="La fricción de cancelación aparece en varias capas; no es exclusiva de no prósperos."
        defaultExpanded
      >
        <Box sx={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={crossData}>
              <CartesianGrid stroke={chartGridStroke(theme)} vertical={false} />
              <XAxis dataKey="labelFull" tick={chartAxisTick(theme)} interval={0} />
              <YAxis tick={chartAxisTick(theme)} allowDecimals={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as (typeof crossData)[number];
                  return (
                    <ChartTooltipCard
                      title={row.label}
                      rows={[
                        { label: 'Con ≥1 CANCELED', value: `${row.withCanceled} / ${row.total}` },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="withCanceled" fill="#c62828" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Una cita CANCELED puede existir sin tag Problemática o Bloqueado.
        </Typography>
      </MetricsSection>
    </Stack>
  );
};

export default FriccionSection;
