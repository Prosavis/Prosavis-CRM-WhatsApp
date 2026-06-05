import React from 'react';
import { Grid, Alert, AlertTitle, Box } from '@mui/material';
import {
  Chat as ChatIcon,
  TextFields as TextIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  CalendarMonth as CalendarIcon,
  PhotoLibrary as PhotoIcon,
  Block as BlockIcon,
  Campaign as CampaignIcon,
  Info as InfoIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import MetricCard from './MetricCard';
import type { GeneralMetrics } from '@/services/monitorService';

interface MetricsGridProps {
  metrics: GeneralMetrics | null;
  loading: boolean;
}

const MetricsGrid: React.FC<MetricsGridProps> = ({ metrics, loading }) => {
  if (loading) {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: 11 }).map((_, i) => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={i}>
            <Box sx={{
              p: 2, border: '1px solid', borderColor: 'divider',
              borderRadius: '12px', bgcolor: 'background.paper',
              height: 120, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 1,
            }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'action.hover', animation: 'pulse 2s infinite' }} />
              <Box sx={{ width: 60, height: 24, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: '0.15s' }} />
              <Box sx={{ width: 80, height: 14, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: '0.3s' }} />
            </Box>
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!metrics) {
    return (
      <Alert severity="warning">
        <AlertTitle>Métricas no disponibles</AlertTitle>
        No se pudieron cargar las métricas generales.
      </Alert>
    );
  }

  const cards = [
    { label: 'Conversaciones', value: metrics.conversations, icon: <ChatIcon fontSize="small" />, color: '#1976d2', bg: '#e3f2fd' },
    { label: 'Mensajes', value: metrics.messages, icon: <TextIcon fontSize="small" />, color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'Activas', value: metrics.activeConversations, icon: <ChatIcon fontSize="small" />, color: '#00897b', bg: '#e0f2f1' },
    { label: 'Leads', value: metrics.leads, icon: <PeopleIcon fontSize="small" />, color: '#ed6c02', bg: '#fff3e0' },
    { label: 'Clientes', value: metrics.clients, icon: <BusinessIcon fontSize="small" />, color: '#7b1fa2', bg: '#f3e5f5' },
    { label: 'Citas', value: metrics.appointments, icon: <CalendarIcon fontSize="small" />, color: '#1565c0', bg: '#e3f2fd' },
    { label: 'Assets', value: metrics.mediaAssets, icon: <PhotoIcon fontSize="small" />, color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'Blocklist', value: metrics.blocklisted, icon: <BlockIcon fontSize="small" />, color: '#d32f2f', bg: '#ffebee' },
    { label: 'Broadcasts', value: metrics.broadcastJobs, icon: <CampaignIcon fontSize="small" />, color: '#6a1b9a', bg: '#f3e5f5' },
    { label: 'Tags', value: metrics.tags, icon: <InfoIcon fontSize="small" />, color: '#00838f', bg: '#e0f7fa' },
    { label: 'Admins', value: metrics.adminProfiles, icon: <AdminIcon fontSize="small" />, color: '#37474f', bg: '#eceff1' },
  ];

  return (
    <Grid container spacing={2}>
      {cards.map((m, idx) => (
        <Grid item xs={6} sm={4} md={3} lg={2} key={m.label}>
          <MetricCard
            label={m.label}
            value={m.value}
            icon={m.icon}
            color={m.color}
            bgColor={m.bg}
            delay={0.05 * idx}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default MetricsGrid;
