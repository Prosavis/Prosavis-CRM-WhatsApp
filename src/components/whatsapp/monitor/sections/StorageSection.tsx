import React from 'react';
import { Box, Stack, Typography, LinearProgress, Grid, Chip, Alert, AlertTitle, useTheme } from '@mui/material';
import {
  Storage as StorageIcon,
  PhotoLibrary as PhotoIcon,
  Videocam as VideoIcon,
  Mic as AudioIcon,
  Description as DocIcon,
  TextFields as TextIcon,
  Info as InfoIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import BentoCard from '../ui/BentoCard';
import RadialGauge from '../charts/RadialGauge';
import type { StorageStats, MediaBreakdown } from '@/services/monitorService';

const BREAKDOWN_CONFIG: Record<
  keyof MediaBreakdown,
  { label: string; icon: React.ReactNode; color: string }
> = {
  image: { label: 'Fotos', icon: <PhotoIcon fontSize="small" />, color: '#1976d2' },
  video: { label: 'Videos', icon: <VideoIcon fontSize="small" />, color: '#2e7d32' },
  audio: { label: 'Audios', icon: <AudioIcon fontSize="small" />, color: '#ed6c02' },
  document: { label: 'Documentos', icon: <DocIcon fontSize="small" />, color: '#9c27b0' },
  text: { label: 'Solo texto', icon: <TextIcon fontSize="small" />, color: '#757575' },
  other: { label: 'Otros', icon: <InfoIcon fontSize="small" />, color: '#78909c' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

interface StorageSectionProps {
  storage: StorageStats | null;
  loading: boolean;
}

const StorageSection: React.FC<StorageSectionProps> = ({ storage, loading }) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <BentoCard>
            <Box sx={{ height: 260, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Box className="skeleton-circle" sx={{ width: 180, height: 180, borderRadius: '50%', bgcolor: 'action.hover' }} />
            </Box>
          </BentoCard>
        </Grid>
        {[0, 1].map((i) => (
          <Grid item xs={6} md={3} key={i}>
            <BentoCard>
              <Box sx={{ height: 120, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: `${i * 0.2}s` }} />
            </BentoCard>
          </Grid>
        ))}
        <Grid item xs={12}>
          <BentoCard>
            <Box sx={{ height: 200, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: '0.4s' }} />
          </BentoCard>
        </Grid>
      </Grid>
    );
  }

  if (!storage) {
    return (
      <Alert severity="warning" icon={<StorageIcon />}>
        <AlertTitle>Almacenamiento no disponible</AlertTitle>
        No se pudieron cargar las estadísticas. Verifica la conexión con Supabase.
      </Alert>
    );
  }

  const gaugePct = Math.min(storage.usedPercent, 100);
  const breakdownEntries = Object.keys(BREAKDOWN_CONFIG) as (keyof MediaBreakdown)[];

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <BentoCard sx={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <RadialGauge value={gaugePct} usedBytes={storage.totalBytes} freeBytes={storage.freeBytes} />
        </BentoCard>
      </Grid>

      <Grid item xs={6} md={3}>
        <BentoCard sx={{ height: '100%', textAlign: 'center' }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '50%',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(144,202,249,0.08)' : '#e3f2fd',
            display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1, color: '#1976d2',
          }}>
            <StorageIcon />
          </Box>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Typography variant="h4" fontWeight={800} fontFamily="'JetBrains Mono', monospace" sx={{ color: '#1976d2' }}>
              {formatNumber(storage.totalObjects)}
            </Typography>
          </motion.div>
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            Archivos multimedia
          </Typography>
        </BentoCard>
      </Grid>

      <Grid item xs={6} md={3}>
        <BentoCard sx={{ height: '100%', textAlign: 'center' }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '50%',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(206,147,216,0.08)' : '#f3e5f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1, color: '#7b1fa2',
          }}>
            <SpeedIcon />
          </Box>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <Typography variant="h4" fontWeight={800} fontFamily="'JetBrains Mono', monospace" sx={{ color: '#7b1fa2' }}>
              {formatBytes(storage.freeBytes)}
            </Typography>
          </motion.div>
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            Espacio libre
          </Typography>
        </BentoCard>
      </Grid>

      <Grid item xs={12}>
        <BentoCard>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Distribución por tipo
            </Typography>
            <Chip
              label={`${breakdownEntries.filter((k) => storage.breakdown[k].count > 0).length} tipos`}
              size="small" variant="outlined"
            />
          </Stack>
          <Stack spacing={1.25}>
            {breakdownEntries.map((key, idx) => {
              const item = storage.breakdown[key];
              const cfg = BREAKDOWN_CONFIG[key];
              const pct = storage.totalBytes > 0 ? (item.bytes / storage.totalBytes) * 100 : 0;
              if (item.count === 0 && item.bytes === 0) return null;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + idx * 0.08 }}
                >
                  <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 0.5, borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cfg.color, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                        <Typography variant="body2" fontWeight={600}>{cfg.label}</Typography>
                        <Typography variant="body2" color="text.secondary" fontFamily="'JetBrains Mono', monospace">
                          {pct.toFixed(0)}% · {formatBytes(item.bytes)}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate" value={pct}
                        sx={{
                          height: 6, borderRadius: 3, bgcolor: 'action.hover',
                          '& .MuiLinearProgress-bar': { bgcolor: cfg.color, borderRadius: 3 },
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: 'right', flexShrink: 0 }}>
                      {item.count} arch.
                    </Typography>
                  </Box>
                </motion.div>
              );
            })}
          </Stack>
        </BentoCard>
      </Grid>
    </Grid>
  );
};

export default StorageSection;
