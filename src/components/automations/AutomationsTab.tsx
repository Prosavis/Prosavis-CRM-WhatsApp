import React, { useState } from 'react';
import { Alert, AlertTitle, Box, Button, Tab, Tabs } from '@mui/material';
import { useReminderAutomationsDashboard } from '@/hooks/useReminderAutomationsDashboard';
import ReminderSummaryHeader from './ReminderSummaryHeader';
import ReminderRecipientPanel from './ReminderRecipientPanel';

const AutomationsTab: React.FC = () => {
  const { data, isLoading, isFetching, error, refetch } = useReminderAutomationsDashboard();
  const [subTab, setSubTab] = useState(0);

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
      <ReminderSummaryHeader
        dashboard={data}
        loading={isLoading || isFetching}
        onRefresh={() => void refetch()}
      />

      {error && (
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

      {data && (
        <>
          <Tabs
            value={subTab}
            onChange={(_, v: number) => setSubTab(v)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Clientes" sx={{ textTransform: 'none', fontWeight: 600 }} />
            <Tab label="Cleaners" sx={{ textTransform: 'none', fontWeight: 600 }} />
          </Tabs>

          {subTab === 0 && (
            <ReminderRecipientPanel
              recipientType="client"
              upcoming={data.clients.upcoming}
              lastRun={data.clients.lastRun}
              onRefresh={() => void refetch()}
            />
          )}
          {subTab === 1 && (
            <ReminderRecipientPanel
              recipientType="professional"
              upcoming={data.professionals.upcoming}
              lastRun={data.professionals.lastRun}
              onRefresh={() => void refetch()}
            />
          )}
        </>
      )}
    </Box>
  );
};

export default AutomationsTab;
