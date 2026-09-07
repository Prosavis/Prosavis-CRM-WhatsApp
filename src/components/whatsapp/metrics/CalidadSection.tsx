import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
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
import type { ClientQualityMetrics, QualityLayer } from '@/types/whatsapp';
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
} from './shared/metricsTheme';

interface CalidadSectionProps {
  metrics?: ClientQualityMetrics;
  loading: boolean;
  error?: string | null;
  updatedAt?: number;
  onRetry?: () => void;
}

const LAYER_LABELS: Record<QualityLayer, string> = {
  risk: 'Riesgo',
  favorite: 'Favorito',
  recurring: 'Recurrente / sólido',
  standard: 'Estándar',
};

const CalidadSection: React.FC<CalidadSectionProps> = ({
  metrics,
  loading,
  error,
  updatedAt,
  onRetry,
}) => {
  const theme = useTheme();
  const palette = metricsPalette(theme);
  const [selectedLayer, setSelectedLayer] = useState<QualityLayer | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const layerData = useMemo(
    () =>
      (metrics?.layers ?? []).map((layer) => ({
        ...layer,
        color: palette[layer.key],
      })),
    [metrics?.layers, palette],
  );

  const compositionRow = useMemo(
    () =>
      Object.fromEntries(layerData.map((layer) => [layer.key, layer.pct])) as Record<
        QualityLayer,
        number
      >,
    [layerData],
  );

  const tagData = useMemo(
    () =>
      [...(metrics?.tags ?? [])]
        .filter((tag) => tag.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((tag) => ({
          ...tag,
          color:
            tag.key === 'favoritos'
              ? palette.favorite
              : ['problematica', 'bloqueado', 'decline'].includes(tag.key)
                ? palette.risk
                : palette.recurring,
        })),
    [metrics?.tags, palette],
  );

  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('es');
    return (metrics?.clients ?? [])
      .filter((row) => !selectedLayer || row.layer === selectedLayer)
      .filter((row) => {
        if (!normalized) return true;
        return [row.name, row.phone, row.layer, ...(row.tags ?? [])]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('es').includes(normalized));
      })
      .toSorted((a, b) => b.completedCount - a.completedCount);
  }, [metrics?.clients, search, selectedLayer]);

  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1),
  );
  const pageRows = filteredRows.slice(
    safePage * rowsPerPage,
    safePage * rowsPerPage + rowsPerPage,
  );
  const nucleus = metrics?.nucleusSize ?? 0;
  const dominantLayer = layerData.toSorted((a, b) => b.count - a.count)[0];

  return (
    <MetricsPageState
      loading={loading}
      error={error}
      empty={!metrics || nucleus === 0}
      onRetry={onRetry}
      emptyTitle="Aún no hay clientes con servicios completados"
    >
      {metrics ? (
        <>
          <MetricsViewHeader
            title="Calidad de clientes"
            purpose="Distingue relaciones sólidas, clientes estándar y señales de riesgo dentro del histórico completado."
            periodLabel={
              metrics.period.from || metrics.period.to
                ? `${metrics.period.from ?? 'Inicio'} – ${metrics.period.to ?? 'Hoy'}`
                : 'Histórico completo'
            }
            universeLabel={`${formatMetricInt(nucleus)} clientes`}
            updatedAt={updatedAt}
            insights={[
              {
                label: 'Capa dominante',
                value: dominantLayer
                  ? `${dominantLayer.label} · ${formatMetricPct(dominantLayer.pct)}`
                  : 'Sin datos',
              },
              {
                label: 'Relaciones sólidas',
                value: `${formatMetricPct(
                  (metrics.layers.find((layer) => layer.key === 'favorite')?.pct ?? 0) +
                    (metrics.layers.find((layer) => layer.key === 'recurring')?.pct ?? 0),
                )}`,
                detail: 'Favoritos + recurrentes',
                tone: 'positive',
              },
              {
                label: 'Señales de riesgo',
                value: `${formatMetricInt(metrics.riskUnique.count)} · ${formatMetricPct(
                  metrics.riskUnique.pct,
                )}`,
                detail:
                  metrics.riskUnique.ratio == null
                    ? undefined
                    : `1 de cada ${formatMetricInt(metrics.riskUnique.ratio)}`,
                tone: 'risk',
              },
            ]}
          />

          <MetricsContextBanner summary="Cómo se construyen las capas">
            Cada cliente aparece una sola vez. La prioridad es riesgo, favorito, recurrente y
            estándar. Riesgo reúne Problemática, Bloqueado o Decline sin doble conteo; recurrente
            exige dos o más servicios completados o el tag correspondiente.
          </MetricsContextBanner>

          <MetricsChartFrame
            title="¿Cómo se compone el núcleo completado?"
            description="Selecciona una capa para filtrar la evidencia."
            unit="% del núcleo"
            summary={`${dominantLayer?.label ?? 'La capa principal'} representa ${
              dominantLayer ? formatMetricPct(dominantLayer.pct) : '0,0%'
            } del universo analizado.`}
            height={190}
            toolbar={
              selectedLayer ? (
                <Button
                  size="small"
                  startIcon={<ClearIcon />}
                  onClick={() => {
                    setSelectedLayer(null);
                    setPage(0);
                  }}
                >
                  Limpiar capa
                </Button>
              ) : undefined
            }
            dataTable={
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {layerData.map((layer) => (
                  <Chip
                    key={layer.key}
                    label={`${layer.label}: ${formatMetricInt(layer.count)} · ${formatMetricPct(layer.pct)}`}
                    onClick={() => {
                      setSelectedLayer((current) => (current === layer.key ? null : layer.key));
                      setPage(0);
                    }}
                    aria-pressed={selectedLayer === layer.key}
                    variant={selectedLayer === layer.key ? 'filled' : 'outlined'}
                    sx={{
                      bgcolor: selectedLayer === layer.key ? layer.color : undefined,
                      color: selectedLayer === layer.key ? 'common.white' : 'text.primary',
                      borderColor: layer.color,
                      '&:focus-visible': {
                        outline: '3px solid',
                        outlineColor: 'secondary.main',
                        outlineOffset: 2,
                      },
                    }}
                  />
                ))}
              </Stack>
            }
          >
            <ResponsiveContainer>
              <BarChart data={[compositionRow]} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" hide />
                {layerData.map((layer) => (
                  <Bar
                    key={layer.key}
                    dataKey={layer.key}
                    stackId="quality"
                    fill={layer.color}
                    isAnimationActive={false}
                    onClick={() => {
                      setSelectedLayer((current) => (current === layer.key ? null : layer.key));
                      setPage(0);
                    }}
                  >
                    {layer.pct >= 10 ? (
                      <LabelList
                        dataKey={layer.key}
                        position="center"
                        fill={theme.palette.common.white}
                        formatter={(value) =>
                          typeof value === 'number' ? `${value.toLocaleString('es-CO')}%` : ''
                        }
                      />
                    ) : null}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </MetricsChartFrame>

          <MetricsChartFrame
            title="¿Qué señales aparecen con mayor frecuencia?"
            description="Un cliente puede tener varios tags; estas barras no son capas excluyentes."
            unit="clientes y % del núcleo"
            summary={`${tagData[0]?.label ?? 'Ningún tag'} es la señal más frecuente con ${
              tagData[0] ? formatMetricInt(tagData[0].count) : '0'
            } clientes.`}
            height={Math.max(260, tagData.length * 38)}
          >
            <ResponsiveContainer>
              <BarChart
                data={tagData}
                layout="vertical"
                margin={{ top: 4, right: 52, left: 20, bottom: 4 }}
              >
                <CartesianGrid stroke={chartGridStroke(theme)} horizontal={false} />
                <XAxis type="number" tick={chartAxisTick(theme)} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={chartAxisTick(theme)}
                  width={118}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const row = payload[0].payload as (typeof tagData)[number];
                    return (
                      <ChartTooltipCard
                        title={row.label}
                        rows={[
                          { label: 'Clientes', value: formatMetricInt(row.count) },
                          { label: 'Del núcleo', value: formatMetricPct(row.pct) },
                          {
                            label: 'Frecuencia',
                            value: row.ratio ? `1 cada ${formatMetricInt(row.ratio)}` : '—',
                          },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="count" radius={[0, 5, 5, 0]} isAnimationActive={false}>
                  {tagData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    fill={theme.palette.text.primary}
                    formatter={(value) =>
                      typeof value === 'number' ? formatMetricInt(value) : ''
                    }
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </MetricsChartFrame>

          <Box sx={{ mb: 2 }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700} gutterBottom>
              ¿Los favoritos muestran una relación más sólida?
            </Typography>
            <MetricsKpiGrid minWidth={210}>
              <MetricsKpiCard
                label={`Favoritos · n=${metrics.favoritesVsRest.favorites.n}`}
                value={`${formatMetricPct(metrics.favoritesVsRest.favorites.pctTwoPlus)} con 2+`}
                detail={`${metrics.favoritesVsRest.favorites.avgCompleted.toLocaleString('es-CO')} completados promedio`}
                accent={palette.favorite}
              />
              <MetricsKpiCard
                label={`Resto del núcleo · n=${metrics.favoritesVsRest.rest.n}`}
                value={`${formatMetricPct(metrics.favoritesVsRest.rest.pctTwoPlus)} con 2+`}
                detail={`${metrics.favoritesVsRest.rest.avgCompleted.toLocaleString('es-CO')} completados promedio`}
                accent={palette.neutral}
              />
            </MetricsKpiGrid>
          </Box>

          <Box
            component="section"
            aria-labelledby="quality-evidence-title"
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="space-between"
              spacing={1}
              sx={{ p: 2, bgcolor: 'action.hover' }}
            >
              <Box>
                <Typography id="quality-evidence-title" component="h2" variant="subtitle1" fontWeight={700}>
                  Evidencia por cliente
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedLayer ? LAYER_LABELS[selectedLayer] : 'Todas las capas'} ·{' '}
                  {formatMetricInt(filteredRows.length)} resultados
                </Typography>
              </Box>
              <TextField
                size="small"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                label="Buscar cliente, teléfono o tag"
                sx={{ minWidth: { sm: 280 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
            <MetricsDataTable
              ariaLabel="Evidencia de calidad por cliente"
              count={filteredRows.length}
              page={safePage}
              onPageChange={setPage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(nextRowsPerPage) => {
                setRowsPerPage(nextRowsPerPage);
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100]}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Capa</TableCell>
                  <TableCell align="right">Completados</TableCell>
                  <TableCell align="right">Cancelados</TableCell>
                  <TableCell>Tags</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{row.name || 'Sin nombre'}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.phone || '—'}
                    </TableCell>
                    <TableCell>{LAYER_LABELS[row.layer]}</TableCell>
                    <TableCell align="right">{formatMetricInt(row.completedCount)}</TableCell>
                    <TableCell align="right">{formatMetricInt(row.canceledCount)}</TableCell>
                    <TableCell>{row.tags.join(', ') || '—'}</TableCell>
                  </TableRow>
                ))}
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      No hay clientes que coincidan con estos filtros.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </MetricsDataTable>
          </Box>
        </>
      ) : null}
    </MetricsPageState>
  );
};

export default CalidadSection;
