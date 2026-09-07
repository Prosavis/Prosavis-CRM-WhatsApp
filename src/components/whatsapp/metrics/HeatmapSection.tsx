import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import type { AppointmentHeatmapResult, HeatmapPoint, QualityLayer } from '@/types/whatsapp';
import { QUALITY_LAYER_COLORS } from './qualityChartTheme';

const PEREIRA_CENTER: L.LatLngExpression = [4.8133, -75.6961];

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
}) => {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [selected, setSelected] = useState<HeatmapPoint | null>(null);

  const points = data?.points ?? [];
  const coverage = data?.coverage;

  const heatLatLngs = useMemo(
    () => points.map((point) => [point.lat, point.lng, 0.7] as [number, number, number]),
    [points],
  );

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      center: PEREIRA_CENTER,
      zoom: 13,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      heatRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    markersRef.current?.clearLayers();
    if (heatLatLngs.length > 0) {
      heatRef.current = L.heatLayer(heatLatLngs, {
        radius: 22,
        blur: 18,
        maxZoom: 17,
      }).addTo(map);
      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as L.LatLngTuple));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.12));
    } else {
      map.setView(PEREIRA_CENTER, 13);
    }
    for (const point of points) {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 6,
        color: QUALITY_LAYER_COLORS[point.layer as QualityLayer] ?? '#1976d2',
        weight: 1,
        fillOpacity: 0.35,
      });
      marker.on('click', () => setSelected(point));
      markersRef.current?.addLayer(marker);
    }
  }, [heatLatLngs, points]);

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error">{error}</Alert>}
      <Alert severity="info">
        El calor usa el GPS de «Iniciar servicio» (`providerGeoCheckpoints.IN_PROGRESS`), no el
        centroide de Pereira / Dosquebradas / Santa Rosa. El fallback de dirección es un toggle
        explícito: en modo GPS no se rellena con la agenda.
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
        <FormControlLabel
          control={
            <Switch
              checked={preferGps}
              onChange={(e) => onPreferGpsChange(e.target.checked)}
            />
          }
          label={preferGps ? 'Puntos: GPS de inicio' : 'Puntos: dirección de agenda'}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Estado</InputLabel>
          <Select value={status} label="Estado" onChange={(e) => onStatusChange(e.target.value)}>
            <MenuItem value="all">Todos</MenuItem>
            <MenuItem value="COMPLETED">COMPLETED</MenuItem>
            <MenuItem value="CANCELED">CANCELED</MenuItem>
            <MenuItem value="CONFIRMED">CONFIRMED</MenuItem>
            <MenuItem value="IN_PROGRESS">IN_PROGRESS</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Capa</InputLabel>
          <Select value={layer} label="Capa" onChange={(e) => onLayerChange(e.target.value)}>
            <MenuItem value="all">Todas</MenuItem>
            <MenuItem value="favorite">Favorito</MenuItem>
            <MenuItem value="recurring">Recurrente</MenuItem>
            <MenuItem value="standard">Estándar</MenuItem>
            <MenuItem value="risk">Riesgo</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {coverage && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`Citas: ${coverage.total}`} />
          <Chip size="small" color="success" label={`GPS inicio: ${coverage.withGps}`} />
          <Chip size="small" label={`Solo dirección: ${coverage.withAddressOnly}`} />
          <Chip size="small" label={`Sin punto: ${coverage.withoutPoint}`} />
          <Chip size="small" variant="outlined" label={`En mapa: ${points.length}`} />
        </Stack>
      )}
      <Box sx={{ position: 'relative', height: 520, borderRadius: 2, overflow: 'hidden' }}>
        <div ref={mapEl} style={{ height: '100%', width: '100%' }} />
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(255,255,255,0.45)',
            }}
          >
            <CircularProgress />
          </Box>
        )}
      </Box>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cita en el mapa</DialogTitle>
        <DialogContent>
          {selected && (
            <Stack spacing={0.75} sx={{ pt: 1 }}>
              <Typography variant="body2">ID: {selected.id}</Typography>
              <Typography variant="body2">Capa: {selected.layer}</Typography>
              <Typography variant="body2">Estado: {selected.status}</Typography>
              <Typography variant="body2">
                Origen: {selected.source === 'gps' ? 'GPS de inicio' : 'Dirección de agenda'}
              </Typography>
              <Typography variant="body2">
                Fecha: {selected.scheduledStart ? new Date(selected.scheduledStart).toLocaleString('es-CO') : '—'}
              </Typography>
              <Typography variant="body2">
                {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
              </Typography>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
};

export default HeatmapSection;
