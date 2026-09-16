import React from 'react';
import {
  Box,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { AppMetricsSnapshot } from '@/types/whatsapp';
import type { MetricsDays } from '@/utils/metricsVistas';
import { metricsPeriodLabel } from '@/utils/metricsVistas';
import { filterSeries } from '@/utils/metricsHistoricalWindows';
import { METRICS_NEGATIVE_TEXT, METRICS_POSITIVE_TEXT } from '@/constants/metricsChartColors';
import MetricsPeriodControl from '../shared/MetricsPeriodControl';
import MetricsViewHeader from '../shared/MetricsViewHeader';

function formatCop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface AppDataSectionProps {
  data: AppMetricsSnapshot | null;
  days: MetricsDays;
  onDaysChange: (days: MetricsDays) => void;
  updatedAt?: number;
}

const AppDataSection: React.FC<AppDataSectionProps> = ({
  data,
  days,
  onDaysChange,
  updatedAt,
}) => {
  if (!data) return null;
  const today = data.today ?? data.generatedAt.slice(0, 10);
  const daily = filterSeries(data.appointmentDaily, days, today);
  const completedInWindow = daily.reduce((sum, point) => sum + point.completed, 0);
  const scoreColor = data.profile.health.score >= 80
    ? METRICS_POSITIVE_TEXT
    : data.profile.health.score >= 50
      ? '#B45309'
      : METRICS_NEGATIVE_TEXT;

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0, width: '100%', overflowX: 'hidden' }}>
      <Stack direction="column" justifyContent="space-between" spacing={1.5} sx={{ minWidth: 0 }}>
        <MetricsViewHeader
          title="Datos de la app"
          purpose="Perfil, embudo y operación de Prosavis Limpieza en la app. El score es solo presentacional."
          periodLabel={metricsPeriodLabel(days)}
          universeLabel={`${data.profile.views.toLocaleString('es-CO')} visitas`}
          updatedAt={updatedAt}
          insights={[
            { label: 'Calificación', value: data.profile.rating > 0 ? `${data.profile.rating} ★` : 'N/A' },
            { label: 'Completados en el periodo', value: completedInWindow.toLocaleString('es-CO') },
          ]}
        />
        <MetricsPeriodControl days={days} onDaysChange={onDaysChange} />
      </Stack>

      <Grid container spacing={2}>
        {[
          { label: 'Visitas', value: data.funnel.views.toLocaleString('es-CO') },
          { label: 'Guardados', value: data.funnel.favorites.toLocaleString('es-CO') },
          { label: 'Contactos', value: data.funnel.contacts.toLocaleString('es-CO') },
          { label: 'Citas pendientes', value: data.appointments.pending.toLocaleString('es-CO') },
        ].map((kpi) => (
          <Grid item xs={6} md={3} key={kpi.label}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
              <Typography variant="h6" fontWeight={700}>{kpi.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Embudo de conversión
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Visitas → guardados → contactos de la app
            </Typography>
            {[
              { label: 'Visitas', value: data.funnel.views },
              { label: 'Guardados', value: data.funnel.favorites },
              { label: 'Contactos', value: data.funnel.contacts },
            ].map((row) => (
              <Box key={row.label} sx={{ mb: 1.5 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">{row.label}</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {row.value.toLocaleString('es-CO')}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  aria-label={`${row.label}: ${row.value.toLocaleString('es-CO')}`}
                  title={`${row.label}: ${row.value.toLocaleString('es-CO')}`}
                  value={data.funnel.views > 0 ? Math.min(100, (row.value / data.funnel.views) * 100) : 0}
                />
              </Box>
            ))}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Salud del perfil
            </Typography>
            <Typography variant="h3" fontWeight={700} sx={{ color: scoreColor }}>
              {data.profile.health.score}%
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {data.profile.health.completedCriteria} de {data.profile.health.totalCriteria} criterios
            </Typography>
            {data.profile.health.criteria.map((item) => (
              <Typography key={item.key} variant="body2" sx={{ mb: 0.75 }}>
                {item.isMet ? '✓' : '○'} {item.label}
              </Typography>
            ))}
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Operación semanal
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Completadas</Typography>
            <Typography variant="h6">{data.weekly.servicesCompleted}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Ingresos</Typography>
            <Typography variant="h6">{formatCop(data.weekly.totalRevenue)}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Chats</Typography>
            <Typography variant="h6">{data.chats.total}</Typography>
          </Grid>
        </Grid>
      </Paper>
    </Stack>
  );
};

export default AppDataSection;
