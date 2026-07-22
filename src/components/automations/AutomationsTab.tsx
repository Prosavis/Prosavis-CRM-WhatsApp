import React, { useCallback, useEffect, useMemo } from 'react';
import { Alert, AlertTitle, Box, Button, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useReminderAutomationsDashboard } from '@/hooks/useReminderAutomationsDashboard';
import ReminderSummaryHeader from './ReminderSummaryHeader';
import ReminderRecipientPanel from './ReminderRecipientPanel';
import ReminderHistoryPanel from './ReminderHistoryPanel';
import ReactivationPanel from './ReactivationPanel';
import ReactivationHistoryPanel from './ReactivationHistoryPanel';
import PostServicePanel from './PostServicePanel';
import PostServiceHistoryPanel from './PostServiceHistoryPanel';

type AutoSubTab =
  | 'clients'
  | 'cleaners'
  | 'history'
  | 'reactivations'
  | 'react-history'
  | 'post-service'
  | 'post-service-history';

const SUBTAB_INDEX: AutoSubTab[] = [
  'clients',
  'cleaners',
  'history',
  'reactivations',
  'react-history',
  'post-service',
  'post-service-history',
];

function parseAutoParam(value: string | null): AutoSubTab {
  if (value === 'cleaners') return 'cleaners';
  if (value === 'history') return 'history';
  if (value === 'reactivations') return 'reactivations';
  if (value === 'react-history') return 'react-history';
  if (value === 'post-service') return 'post-service';
  if (value === 'post-service-history') return 'post-service-history';
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

  const renderSubTab = () => {
    switch (subTabKey) {
      case 'clients':
        return data ? (
          <ReminderRecipientPanel
            recipientType="client"
            upcoming={data.clients.upcoming}
            lastRun={data.clients.lastRun}
            onRefresh={() => void refetch()}
          />
        ) : null;
      case 'cleaners':
        return data ? (
          <ReminderRecipientPanel
            recipientType="professional"
            upcoming={data.professionals.upcoming}
            lastRun={data.professionals.lastRun}
            onRefresh={() => void refetch()}
          />
        ) : null;
      case 'history':
        return <ReminderHistoryPanel />;
      case 'reactivations':
        return <ReactivationPanel onOpenHistory={() => setSubTab('react-history')} />;
      case 'react-history':
        return <ReactivationHistoryPanel />;
      case 'post-service':
        return (
          <PostServicePanel onOpenHistory={() => setSubTab('post-service-history')} />
        );
      case 'post-service-history':
        return <PostServiceHistoryPanel />;
      default: {
        const exhaustiveCheck: never = subTabKey;
        return exhaustiveCheck;
      }
    }
  };

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
        <Tab label="Post-servicio" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Historial post-servicio" sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>

      {renderSubTab()}
    </Box>
  );
};

export default AutomationsTab;
