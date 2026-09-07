import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import ClearIcon from '@mui/icons-material/Clear';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import type { Theme } from '@mui/material/styles';
import type { AppointmentHeatmapResult, HeatmapPoint, QualityLayer } from '@/types/whatsapp';
import MetricsContextBanner from './shared/MetricsContextBanner';
import MetricsPageState from './shared/MetricsPageState';
import MetricsViewHeader from './shared/MetricsViewHeader';
import {
  formatMetricInt,
  formatMetricPct,
  metricsPalette,
  qualityLayerColor,
  safeRate,
} from './shared/metricsTheme';
import { buildDensityZones } from './utils/heatmapAnalytics';

const PEREIRA_CENTER: L.LatLngExpression = [4.8133, -75.6961];
const EMPTY_POINTS: HeatmapPoint[] = [];

export type HeatmapMode = 'density' | 'points';

function mountPointMarker(
  point: HeatmapPoint,
  theme: Theme,
  markerGroup: L.LayerGroup,
  onSelect: (point: HeatmapPoint) => void,
): () => void {
  const marker = L.circleMarker([point.lat, point.lng], {
    radius: 7,
    color: qualityLayerColor(theme, point.layer as QualityLayer),
    weight: 2,
    fillOpacity: 0.7,
  });
  const handleClick = () => onSelect(point);
  marker.on('click', handleClick);
  markerGroup.addLayer(marker);

  const element = marker.getElement();
  if (!element) {
    return () => {
      marker.off('click', handleClick);
      markerGroup.removeLayer(marker);
    };
  }

  element.setAttribute('tabindex', '0');
  element.setAttribute(
    'aria-label',
    `${point.status}, ${point.layer}, ${point.scheduledStart ?? 'sin fecha'}`,
  );
  element.setAttribute('role', 'button');
  const handleKeyDown = (event: Event) => {
    if (
      event instanceof KeyboardEvent &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      onSelect(point);
    }
  };
  element.addEventListener('keydown', handleKeyDown);

  return () => {
    marker.off('click', handleClick);
    element.removeEventListener('keydown', handleKeyDown);
    markerGroup.removeLayer(marker);
  };
}

interface HeatmapSectionProps {
  data?: AppointmentHeatmapResult;
  loading: boolean;
  error?: string | null;
  preferGps: boolean;
  onPreferGpsChange: (value: boolean) => void;
  status: string;
  onStatusChange: (value: string) => void;
  layer: string;
  onLayerChange: (value: string) => void;
  mode: HeatmapMode;
  onModeChange: (value: HeatmapMode) => void;
  periodLabel: string;
  updatedAt?: number;
  onRetry?: () => void;
}

const HeatmapSection: React.FC<HeatmapSectionProps> = ({
  data,
  loading,
  error,
  preferGps,
  onPreferGpsChange,
  status,
  onStatusChange,
  layer,
  onLayerChange,
  mode,
  onModeChange,
  periodLabel,
  updatedAt,
  onRetry,
}) => {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const palette = metricsPalette(theme);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [selected, setSelected] = useState<HeatmapPoint | null>(null);

  const disposeMap = useCallback(() => {
    mapRef.current?.remove();
    mapRef.current = null;
    heatRef.current = null;
    markersRef.current = null;
    tileRef.current = null;
  }, []);

  const attachMapContainer = useCallback((node: HTMLDivElement | null) => {
    if (node === mapEl.current && mapRef.current) return;
    disposeMap();
    mapEl.current = node;
    if (!node) {
      setMapEpoch((value) => value + 1);
      return;
    }
    const map = L.map(node, {
      center: PEREIRA_CENTER,
      zoom: 13,
      zoomControl: true,
    });
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    requestAnimationFrame(() => {
      map.invalidateSize();
    });
    setMapEpoch((value) => value + 1);
  }, [disposeMap]);

  const points = data?.points ?? EMPTY_POINTS;
  const coverage = data?.coverage;
  const zones = useMemo(() => buildDensityZones(points), [points]);
  const heatLatLngs = useMemo(
    () => points.map((point) => [point.lat, point.lng, 1] as [number, number, number]),
    [points],
  );

  const fitResults = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = L.latLngBounds(
      points.map((point) => [point.lat, point.lng] as L.LatLngTuple),
    );
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.12), { maxZoom: 16 });
    else map.setView(PEREIRA_CENTER, 13);
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.removeFrom(map);
    const tileUrl =
      theme.palette.mode === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    const tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);
    tileRef.current = tileLayer;
    return () => {
      if (map.hasLayer(tileLayer)) map.removeLayer(tileLayer);
      if (tileRef.current === tileLayer) tileRef.current = null;
    };
  }, [mapEpoch, theme.palette.mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return () => undefined;
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    markersRef.current?.clearLayers();

    if (mode === 'density' && heatLatLngs.length > 0) {
      heatRef.current = L.heatLayer(heatLatLngs, {
        radius: 26,
        blur: 20,
        maxZoom: 17,
        gradient: {
          0.2: palette.density[0],
          0.4: palette.density[1],
          0.6: palette.density[2],
          0.8: palette.density[3],
          1: palette.density[4],
        },
      }).addTo(map);
    }

    const markerCleanups: Array<() => void> = [];
    const markerGroup = markersRef.current;
    if (mode === 'points' && markerGroup) {
      for (const point of points) {
        markerCleanups.push(mountPointMarker(point, theme, markerGroup, setSelected));
      }
    }
    fitResults();
    requestAnimationFrame(() => {
      map.invalidateSize();
    });
    const renderedHeat = heatRef.current;
    return () => {
      for (const cleanupMarker of markerCleanups) cleanupMarker();
      if (renderedHeat && map.hasLayer(renderedHeat)) map.removeLayer(renderedHeat);
      if (heatRef.current === renderedHeat) heatRef.current = null;
      markerGroup?.clearLayers();
    };
  }, [fitResults, heatLatLngs, mapEpoch, mode, palette.density, points, theme]);

  const gpsCoverage = coverage ? safeRate(coverage.withGps, coverage.total) : 0;
  const selectedIndex = selected ? points.findIndex((point) => point.id === selected.id) : -1;

  return (
    <MetricsPageState
      loading={loading && !data}
      error={error}
      empty={!loading && Boolean(data) && points.length === 0}
      onRetry={onRetry}
      emptyTitle="No hay puntos para estos filtros"
      emptyDescription="Cambia la fuente, el estado, la capa o el periodo para ampliar el alcance."
    >
      <MetricsViewHeader
        title="Mapa operativo"
        purpose="Encuentra concentración geográfica y audita el punto exacto donde comenzó cada servicio."
        periodLabel={periodLabel}
        universeLabel={`${formatMetricInt(coverage?.total ?? 0)} citas`}
        updatedAt={updatedAt}
        insights={[
          {
            label: 'Cobertura GPS real',
            value: formatMetricPct(gpsCoverage),
            detail: `${formatMetricInt(coverage?.withGps ?? 0)} citas con inicio`,
            tone: gpsCoverage >= 60 ? 'positive' : 'warning',
          },
          {
            label: 'Puntos visibles',
            value: formatMetricInt(points.length),
            detail: preferGps ? 'GPS de inicio' : 'Dirección de agenda',
          },
          {
            label: 'Mayor concentración',
            value: zones[0] ? `${formatMetricInt(zones[0].count)} citas` : 'Sin puntos',
            detail: zones[0] ? `Celda aproximada ${zones[0].key}` : undefined,
          },
        ]}
      />

      <MetricsContextBanner summary="Fuente y precisión geográfica">
        El modo GPS usa el punto capturado al iniciar el servicio. El modo Dirección usa las
        coordenadas de agenda como fuente distinta y explícita. Las concentraciones agrupan celdas
        aproximadas de 0,001°; no inventan nombres de barrios ni usan centroides de ciudad.
      </MetricsContextBanner>

      <Stack
        component="section"
        aria-label="Filtros del mapa"
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        spacing={1.25}
        sx={{ mb: 1.5 }}
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_event, next: HeatmapMode | null) => {
              if (next) onModeChange(next);
            }}
            aria-label="Modo de visualización del mapa"
          >
            <ToggleButton value="density">Densidad</ToggleButton>
            <ToggleButton value="points">Puntos por capa</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={preferGps ? 'gps' : 'address'}
            onChange={(_event, next: 'gps' | 'address' | null) => {
              if (next) onPreferGpsChange(next === 'gps');
            }}
            aria-label="Fuente geográfica"
          >
            <ToggleButton value="gps">GPS de inicio</ToggleButton>
            <ToggleButton value="address">Dirección</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="heatmap-status-label">Estado</InputLabel>
            <Select
              labelId="heatmap-status-label"
              value={status}
              label="Estado"
              onChange={(event) => onStatusChange(event.target.value)}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="COMPLETED">Completado</MenuItem>
              <MenuItem value="CANCELED">Cancelado</MenuItem>
              <MenuItem value="CONFIRMED">Confirmado</MenuItem>
              <MenuItem value="IN_PROGRESS">En curso</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="heatmap-layer-label">Capa</InputLabel>
            <Select
              labelId="heatmap-layer-label"
              value={layer}
              label="Capa"
              onChange={(event) => onLayerChange(event.target.value)}
            >
              <MenuItem value="all">Todas</MenuItem>
              <MenuItem value="favorite">Favorito</MenuItem>
              <MenuItem value="recurring">Recurrente</MenuItem>
              <MenuItem value="standard">Estándar</MenuItem>
              <MenuItem value="risk">Riesgo</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<CenterFocusStrongIcon />} onClick={fitResults}>
            Ajustar a resultados
          </Button>
          {(status !== 'all' || layer !== 'all') ? (
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => {
                onStatusChange('all');
                onLayerChange('all');
              }}
            >
              Limpiar
            </Button>
          ) : null}
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(280px, 3fr)' },
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            position: 'relative',
            height: { xs: 420, sm: 520, lg: 600 },
            minHeight: 360,
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <div
            ref={attachMapContainer}
            role="region"
            aria-label={`Mapa de ${formatMetricInt(points.length)} citas. Modo ${
              mode === 'density' ? 'densidad' : 'puntos por capa'
            }.`}
            style={{ height: '100%', width: '100%' }}
          />
          {loading ? (
            <Box
              role="status"
              aria-live="polite"
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'background.paper',
                opacity: 0.82,
              }}
            >
              <Typography variant="body2" fontWeight={600}>
                Actualizando puntos…
              </Typography>
            </Box>
          ) : null}
        </Box>

        <Box
          component="aside"
          aria-label="Lectura y detalle del mapa"
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            overflow: 'hidden',
            maxHeight: { lg: 600 },
          }}
        >
          <Box sx={{ p: 2 }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700}>
              Lectura del mapa
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
              <Chip label={`${formatMetricPct(gpsCoverage)} GPS`} size="small" variant="outlined" />
              <Chip label={`${formatMetricInt(coverage?.withAddressOnly ?? 0)} solo dirección`} size="small" />
              <Chip label={`${formatMetricInt(coverage?.withoutPoint ?? 0)} sin punto`} size="small" />
            </Stack>
          </Box>
          <Divider />
          {selected ? (
            <Box sx={{ p: 2 }} aria-live="polite">
              <Typography variant="caption" color="text.secondary">
                Punto seleccionado {selectedIndex + 1} de {points.length}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5 }}>
                {selected.status} · {selected.layer}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.75 }}>
                {selected.scheduledStart
                  ? new Date(selected.scheduledStart).toLocaleString('es-CO')
                  : 'Sin fecha programada'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {selected.source === 'gps' ? 'GPS de inicio' : 'Dirección de agenda'} ·{' '}
                {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {mode === 'points'
                  ? 'Selecciona un punto o una fila para inspeccionar la cita.'
                  : 'Cambia a Puntos por capa para inspeccionar citas individuales.'}
              </Typography>
            </Box>
          )}
          <Divider />
          <Box sx={{ p: 1.5, pb: 0.5 }}>
            <Typography component="h3" variant="subtitle2" fontWeight={700}>
              {compact ? 'Lista accesible' : 'Citas visibles'}
            </Typography>
          </Box>
          <List dense sx={{ overflowY: 'auto', maxHeight: { xs: 280, lg: 360 } }}>
            {points.slice(0, 100).map((point) => (
              <ListItem key={point.id} disablePadding>
                <ListItemButton
                  selected={selected?.id === point.id}
                  onClick={() => {
                    setSelected(point);
                    mapRef.current?.panTo([point.lat, point.lng]);
                  }}
                >
                  <ListItemText
                    primary={`${point.status} · ${point.layer}`}
                    secondary={`${
                      point.scheduledStart
                        ? new Date(point.scheduledStart).toLocaleDateString('es-CO')
                        : 'Sin fecha'
                    } · ${point.source === 'gps' ? 'GPS' : 'Dirección'}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          {points.length > 100 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 1.5 }}>
              Se muestran las primeras 100 citas. Ajusta los filtros para reducir el alcance.
            </Typography>
          ) : null}
        </Box>
      </Box>
    </MetricsPageState>
  );
};

export default HeatmapSection;
