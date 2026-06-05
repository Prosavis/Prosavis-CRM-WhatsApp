import React from 'react';
import { Box, Stack, Typography, Chip, CircularProgress } from '@mui/material';
import {
  Storage as StorageIcon,
  AdminPanelSettings as AdminPanelIcon,
  Chat as ChatIcon,
} from '@mui/icons-material';
import BentoCard from '../ui/BentoCard';
import type { ConnectionStatus } from '@/services/monitorService';

interface ConnectionsSectionProps {
  connections: ConnectionStatus;
}

const StatusDot: React.FC<{ status: 'ok' | 'error' | 'checking' }> = ({ status }) => {
  if (status === 'checking') return <CircularProgress size={10} sx={{ color: '#ff9800' }} />;
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: status === 'ok' ? '#4caf50' : '#f44336',
        boxShadow: status === 'ok' ? '0 0 6px rgba(76,175,80,0.5)' : 'none',
        animation: status === 'ok' ? 'pulse-dot 3s infinite ease-in-out' : 'none',
        '@keyframes pulse-dot': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(76,175,80,0.3)' },
          '50%': { boxShadow: '0 0 12px rgba(76,175,80,0.7)' },
        },
      }}
    />
  );
};

const ConnectionsSection: React.FC<ConnectionsSectionProps> = ({ connections }) => {
  const items: { label: string; status: ConnectionStatus[keyof ConnectionStatus]; icon: React.ReactNode }[] = [
    { label: 'Supabase (Postgres)', status: connections.supabase, icon: <StorageIcon fontSize="small" /> },
    { label: 'Firebase (Functions)', status: connections.firebase, icon: <AdminPanelIcon fontSize="small" /> },
    { label: 'WhatsApp Cloud API', status: connections.whatsappApi, icon: <ChatIcon fontSize="small" /> },
  ];

  return (
    <BentoCard sx={{ height: '100%' }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Conexiones
      </Typography>
      <Stack spacing={1.5} divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
        {items.map((item) => {
          const isOk = item.status.status === 'ok';
          const isChecking = item.status.status === 'checking';
          const latency = 'latency' in item.status ? (item.status as { latency?: number }).latency : undefined;
          const error = 'error' in item.status ? (item.status as { error?: string }).error : undefined;
          const phoneId = 'phoneNumberId' in item.status ? (item.status as { phoneNumberId?: string }).phoneNumberId : undefined;

          return (
            <Stack key={item.label} direction="row" alignItems="center" spacing={1.5}>
              <StatusDot status={item.status.status} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {item.label}
                </Typography>
                {latency !== undefined && (
                  <Typography variant="caption" color="text.secondary" fontFamily="'JetBrains Mono', monospace">
                    {latency}ms
                  </Typography>
                )}
                {error && (
                  <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                    {error}
                  </Typography>
                )}
                {phoneId && (
                  <Typography variant="caption" color="text.secondary" fontFamily="'JetBrains Mono', monospace" sx={{ display: 'block' }}>
                    ID: {phoneId}
                  </Typography>
                )}
              </Box>
              <Chip
                label={isChecking ? '...' : isOk ? 'OK' : 'Error'}
                size="small"
                color={isOk ? 'success' : isChecking ? 'warning' : 'error'}
                variant="outlined"
                sx={{ height: 22, '& .MuiChip-label': { fontSize: 11, px: 1 } }}
              />
            </Stack>
          );
        })}
      </Stack>
    </BentoCard>
  );
};

export default ConnectionsSection;
