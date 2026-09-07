import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
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
import type { ClientQualityMetrics, QualityLayer } from '@/types/whatsapp';
import MetricsSection from './MetricsSection';
import {
  ChartTooltipCard,
  chartAxisTick,
  chartGridStroke,
  formatAxisInt,
} from './utils/chartTheme';
import { QUALITY_LAYER_COLORS, QUALITY_TAG_COLORS, formatRatio } from './qualityChartTheme';

interface CalidadSectionProps {
  metrics?: ClientQualityMetrics;
  loading: boolean;
  error?: string | null;
}

const CalidadSection: React.FC<CalidadSectionProps> = ({ metrics, loading, error }) => {
  const theme = useTheme();
  const [selectedLayer, setSelectedLayer] = useState<QualityLayer | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const nucleus = metrics?.nucleusSize ?? 0;  const layerData = useMemo(
    () =>
      (metrics?.layers ?? []).map((layer) => ({
        ...layer,
        color: QUALITY_LAYER_COLORS[layer.key],
      })),
    [metrics],
  );
  const tagData = useMemo(
    () =>
      (metrics?.tags ?? []).map((tag) => ({
        ...tag,
        color: QUALITY_TAG_COLORS[tag.key] ?? theme.palette.text.secondary,
      })),
    [metrics, theme.palette.text.secondary],
  );
  const compareData = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        label: `Favoritos (n=${metrics.favoritesVsRest.favorites.n})`,
        key: 'favorites',
        twoPlus: metrics.favoritesVsRest.favorites.pctTwoPlus,
        avg: metrics.favoritesVsRest.favorites.avgCompleted,
      },
      {
        label: `Resto núcleo (n=${metrics.favoritesVsRest.rest.n})`,
        key: 'rest',
        twoPlus: metrics.favoritesVsRest.rest.pctTwoPlus,
        avg: metrics.favoritesVsRest.rest.avgCompleted,
      },
    ];
  }, [metrics]);
  const ratioData = useMemo(
    () =>
      (metrics?.tags ?? [])
        .filter((tag) => ['favoritos', 'problematica', 'bloqueado', 'decline'].includes(tag.key))
        .concat(
          metrics
            ? [{
                key: 'riesgo',
                label: 'Cualquier riesgo',
                count: metrics.riskUnique.count,
                pct: metrics.riskUnique.pct,
                ratio: metrics.riskUnique.ratio,
              }]
            : [],
        )
        .map((tag) => ({
          ...tag,
          every: tag.ratio ?? 0,
          color: tag.key === 'riesgo' ? '#6a1b9a' : QUALITY_TAG_COLORS[tag.key],
        })),
    [metrics],
  );
  const drillRows = useMemo(() => {
    const rows = metrics?.clients ?? [];
    if (!selectedLayer) return rows;
    return rows.filter((row) => row.layer === selectedLayer);
  }, [metrics, selectedLayer]);
  const pageCount = Math.max(1, Math.ceil(drillRows.length / rowsPerPage) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = drillRows.length === 0 ? 0 : safePage * rowsPerPage;
  const pageEnd = Math.min(pageStart + rowsPerPage, drillRows.length);
  const pageRows = drillRows.slice(pageStart, pageEnd);
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
      <MetricsSection
        title={`Calidad del núcleo COMPLETED (N=${nucleus})`}
        subtitle="prioridad: riesgo > favorito > recurrente > estándar. El N no se congela: se recalcula con el histórico."
        defaultExpanded
      >
        <Box sx={{ height: 280 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={layerData}
                dataKey="count"
                nameKey="label"
                innerRadius={58}
                outerRadius={96}
                paddingAngle={2}
                onClick={(_, index) => {
                  const next = layerData[index]?.key ?? null;
                  setSelectedLayer((prev) => (prev === next ? null : next));
                  setPage(0);
                }}
              >
                {layerData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} cursor="pointer" />
                ))}
              </Pie>              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as (typeof layerData)[number];
                  return (
                    <ChartTooltipCard
                      title={row.label}
                      rows={[
                        { label: 'Clientes', value: String(row.count) },
                        { label: '% del núcleo', value: `${row.pct}%` },
                      ]}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          {layerData.map((layer) => (
            <Chip
              key={layer.key}
              size="small"
              label={`${layer.label}: ${layer.count} (${layer.pct}%)`}
              onClick={() => {
                setSelectedLayer((prev) => (prev === layer.key ? null : layer.key));
                setPage(0);
              }}
              sx={{
                bgcolor: selectedLayer === layer.key ? layer.color : 'transparent',
                color: selectedLayer === layer.key ? '#fff' : 'text.primary',
                borderColor: layer.color,
              }}
              variant={selectedLayer === layer.key ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Teléfono</TableCell>
                <TableCell>Capa</TableCell>
                <TableCell align="right">COMPLETED</TableCell>
                <TableCell align="right">CANCELED</TableCell>
                <TableCell>Tags</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.name || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {row.phone || '—'}
                  </TableCell>
                  <TableCell>{layerData.find((layer) => layer.key === row.layer)?.label ?? row.layer}</TableCell>
                  <TableCell align="right">{row.completedCount}</TableCell>
                  <TableCell align="right">{row.canceledCount}</TableCell>
                  <TableCell>{(row.tags ?? []).join(', ') || '—'}</TableCell>
                </TableRow>
              ))}
              {drillRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Sin clientes en esta capa
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={drillRows.length}
          page={drillRows.length === 0 ? 0 : safePage}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number.parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="Filas"
          labelDisplayedRows={({ from, to, count }) =>
            `${from.toLocaleString('es-CO')}–${to.toLocaleString('es-CO')} de ${count.toLocaleString('es-CO')}`
          }
        />
      </MetricsSection>

      <MetricsSection
        title="Tags de calidad"
        subtitle="Conteos sobre quienes ya completaron. Un cliente puede tener varios tags."
        defaultExpanded
      >
        <Box sx={{ height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={tagData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
              <CartesianGrid stroke={chartGridStroke(theme)} vertical={false} />
              <XAxis dataKey="label" tick={chartAxisTick(theme)} interval={0} angle={-18} textAnchor="end" height={56} />
              <YAxis tick={chartAxisTick(theme)} allowDecimals={false} tickFormatter={formatAxisInt} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as (typeof tagData)[number];
                  return (
                    <ChartTooltipCard
                      title={row.label}
                      rows={[
                        { label: 'Clientes', value: String(row.count) },
                        { label: '%', value: `${row.pct}%` },
                        { label: 'Ratio', value: formatRatio(row.ratio) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {tagData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </MetricsSection>

      <MetricsSection
        title="Favoritos vs resto"
        subtitle="Favoritos es raro, pero suele ir con más volumen y mejor relación."
        defaultExpanded
      >
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={compareData}>
              <CartesianGrid stroke={chartGridStroke(theme)} vertical={false} />
              <XAxis dataKey="label" tick={chartAxisTick(theme)} />
              <YAxis tick={chartAxisTick(theme)} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as (typeof compareData)[number];
                  return (
                    <ChartTooltipCard
                      title={row.label}
                      rows={[
                        { label: '% con 2+ COMPLETED', value: `${row.twoPlus}%` },
                        { label: 'COMPLETED promedio', value: String(row.avg) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="twoPlus" name="% 2+" fill="#2e7d32" radius={[6, 6, 0, 0]} />
              <Bar dataKey="avg" name="Promedio" fill="#90a4ae" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </MetricsSection>

      <MetricsSection
        title="Ratios de calidad"
        subtitle="Clientes COMPLETED por cada 1 de ese tipo. Más alto = más raro."
      >
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={ratioData}>
              <CartesianGrid stroke={chartGridStroke(theme)} vertical={false} />
              <XAxis dataKey="label" tick={chartAxisTick(theme)} interval={0} />
              <YAxis tick={chartAxisTick(theme)} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as (typeof ratioData)[number];
                  return (
                    <ChartTooltipCard
                      title={row.label}
                      rows={[
                        { label: 'Ratio', value: formatRatio(row.ratio) },
                        { label: 'n', value: String(row.count) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="every" radius={[6, 6, 0, 0]}>
                {ratioData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </MetricsSection>
    </Stack>
  );
};

export default CalidadSection;
