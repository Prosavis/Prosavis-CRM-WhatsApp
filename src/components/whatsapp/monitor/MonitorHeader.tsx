import React, { useEffect, useState } from 'react';
import { Stack, Typography, IconButton, Tooltip, Chip, Box } from '@mui/material';
import { Refresh as RefreshIcon, Speed as SpeedIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';

interface MonitorHeaderProps {
  loading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

function relativeTime(date: Date | null): string {
  if (!date) return 'nunca';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return 'ahora';
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  return `hace ${Math.floor(diff / 3600)}h`;
}

const LiveDot: React.FC = () => (
  <Box
    sx={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      bgcolor: '#4caf50',
      animation: 'pulse-scale 3s infinite ease-in-out',
      '@keyframes pulse-scale': {
        '0%, 100%': { transform: 'scale(1)', opacity: 0.7 },
        '50%': { transform: 'scale(1.5)', opacity: 1 },
      },
    }}
  />
);

const MonitorHeader: React.FC<MonitorHeaderProps> = ({ loading, lastUpdated, onRefresh }) => {
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
      <SpeedIcon color="primary" sx={{ fontSize: 28 }} />
      <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
        Monitoreo
      </Typography>
      <LiveDot />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80 }}>
        {relativeTime(lastUpdated)}
      </Typography>
      <Chip
        label={loading ? 'Cargando...' : 'En vivo'}
        size="small"
        color={loading ? 'default' : 'success'}
        variant="outlined"
      />
      <Tooltip title="Recargar datos">
        <motion.div
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={{ duration: 0.4, repeat: loading ? Infinity : 0, ease: 'linear' }}
        >
          <IconButton onClick={onRefresh} disabled={loading} size="small">
            <RefreshIcon />
          </IconButton>
        </motion.div>
      </Tooltip>
    </Stack>
  );
};

export default MonitorHeader;
