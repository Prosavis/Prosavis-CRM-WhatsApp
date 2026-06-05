import React, { useEffect, useState, useCallback } from 'react';
import { Box, Alert, AlertTitle, Button } from '@mui/material';
import {
  getMonitorDashboard,
  type MonitorDashboard,
} from '@/services/monitorService';
import MonitorHeader from './monitor/MonitorHeader';
import StorageSection from './monitor/sections/StorageSection';
import HeavyChatsSection from './monitor/sections/HeavyChatsSection';
import ConnectionsSection from './monitor/sections/ConnectionsSection';
import MetricsGrid from './monitor/metrics/MetricsGrid';
import MonitorSkeleton from './monitor/ui/MonitorSkeleton';

const MonitorTab: React.FC = () => {
  const [dashboard, setDashboard] = useState<MonitorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMonitorDashboard();
      setDashboard(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh each 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const storage = dashboard?.storage ?? null;
  const heavyChats = dashboard?.heavyChats ?? [];
  const metrics = dashboard?.metrics ?? null;
  const connections = dashboard?.connections ?? {
    supabase: { status: 'checking' as const },
    firebase: { status: 'checking' as const },
    whatsappApi: { status: 'checking' as const },
  };

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
      <MonitorHeader loading={loading} lastUpdated={lastUpdated} onRefresh={loadData} />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} action={<Button size="small" onClick={loadData}>Reintentar</Button>}>
          <AlertTitle>Error al cargar</AlertTitle>
          {error}
        </Alert>
      )}

      {loading && !dashboard ? (
        <MonitorSkeleton />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Storage */}
          <StorageSection storage={storage} loading={loading && !dashboard} />

          {/* Heavy Chats + Connections side by side */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2 }}>
            <HeavyChatsSection chats={heavyChats} loading={loading} onRefresh={loadData} />
            <ConnectionsSection connections={connections} />
          </Box>

          {/* General Metrics */}
          <MetricsGrid metrics={metrics} loading={loading} />
        </Box>
      )}
    </Box>
  );
};

export default MonitorTab;
