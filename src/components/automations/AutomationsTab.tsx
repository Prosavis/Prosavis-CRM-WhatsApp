import React, { useCallback, useEffect, useMemo } from 'react';
import { Alert, AlertTitle, Box, Button, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useReminderAutomationsDashboard } from '@/hooks/useReminderAutomationsDashboard';
import ReminderSummaryHeader from './ReminderSummaryHeader';
import ReminderRecipientPanel from './ReminderRecipientPanel';
import ReminderHistoryPanel from './ReminderHistoryPanel';
import ReactivationPanel from './ReactivationPanel';
import ReactivationHistoryPanel from './ReactivationHistoryPanel';

type AutoSubTab = 'clients' | 'cleaners' | 'history' | 'reactivations' | 'react-history';

const SUBTAB_INDEX: AutoSubTab[] = [
  'clients',
  'cleaners',
  'history',
  'reactivations',
  'react-history',
];

function parseAutoParam(value: string | null): AutoSubTab {
  if (value === 'cleaners') return 'cleaners';
  if (value === 'history') return 'history';
  if (value === 'reactivations') return 'reactivations';
  if (value === 'react-history') return 'react-history';
  return 'clients';
}

const AutomationsTab: React.FC = () => {
  const { data, isLoading, isFetching, error, refetch } = useReminderAutomationsDashboard();
  const [searchParams, setSearchParams] = useSearchParams();

  const autoParam = searchParams.get('auto');
  const subTabKey = useMemo(() => parseAutoParam(autoParam), [autoParam]);
  const subTab = SUBTAB_INDEX.indexOf(subTabKey);

  const setSubTab = useCallback(
    (next: AutoSubTab) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', 'automations');
          if (next === 'clients') params.delete('auto');
          else params.set('auto', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    // Normaliza valores inválidos de ?auto=
    if (autoParam && !SUBTAB_INDEX.includes(autoParam as AutoSubTab)) {
      setSubTab('clients');
    }
  }, [autoParam, setSubTab]);

  const showReminderHeader = subTabKey === 'clients' || subTabKey === 'cleaners' || subTabKey === 'history';

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
      {showReminderHeader && (
        <ReminderSummaryHeader
          dashboard={data}
          loading={isLoading || isFetching}
          onRefresh={() => void refetch()}
        />
      )}

      {error && showReminderHeader && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button size="small" onClick={() => void refetch()}>
              Reintentar
            </Button>
          }
        >
          <AlertTitle>Error al cargar</AlertTitle>
          {error.message}
        </Alert>
      )}

      <Tabs
        value={subTab}
        onChange={(_, v: number) => setSubTab(SUBTAB_INDEX[v] ?? 'clients')}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Clientes" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Cleaners" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Historial" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Reactivaciones" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Historial reactivaciones" sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>

      {subTabKey === 'clients' && data && (
        <ReminderRecipientPanel
          recipientType="client"
          upcoming={data.clients.upcoming}
          lastRun={data.clients.lastRun}
          onRefresh={() => void refetch()}
        />
      )}
      {subTabKey === 'cleaners' && data && (
        <ReminderRecipientPanel
          recipientType="professional"
          upcoming={data.professionals.upcoming}
          lastRun={data.professionals.lastRun}
          onRefresh={() => void refetch()}
        />
      )}
      {subTabKey === 'history' && <ReminderHistoryPanel />}
      {subTabKey === 'reactivations' && (
        <ReactivationPanel onOpenHistory={() => setSubTab('react-history')} />
      )}
      {subTabKey === 'react-history' && <ReactivationHistoryPanel />}
    </Box>
  );
};

export default AutomationsTab;
