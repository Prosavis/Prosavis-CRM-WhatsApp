import React, { useState } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import type { ReminderRecipientType, ReminderRow } from '@/types/reminderAutomations';
import { setRecipientReminderPreference } from '@/services/reminderAutomationsService';
import { REMINDER_AUTOMATIONS_QUERY_KEY } from '@/hooks/useReminderAutomationsDashboard';
import ReminderTrackingTable from './ReminderTrackingTable';
import ReminderMessageDetailDialog from './ReminderMessageDetailDialog';

export interface ReminderRecipientPanelProps {
  recipientType: ReminderRecipientType;
  upcoming: ReminderRow[];
  lastRun: ReminderRow[];
  onRefresh?: () => void;
}

const ReminderRecipientPanel: React.FC<ReminderRecipientPanelProps> = ({
  upcoming,
  lastRun,
  onRefresh,
}) => {
  const queryClient = useQueryClient();
  const [detailRow, setDetailRow] = useState<ReminderRow | null>(null);
  const [toggleLoadingKey, setToggleLoadingKey] = useState<string | null>(null);

  const handleToggleReminder = async (row: ReminderRow, enabled: boolean) => {
    if (!row.recipientKey) return;
    const key = `${row.recipientKey}:${row.recipientType}`;
    setToggleLoadingKey(key);
    try {
      await setRecipientReminderPreference({
        recipientKey: row.recipientKey,
        recipientType: row.recipientType,
        remindersEnabled: enabled,
      });
      await queryClient.invalidateQueries({ queryKey: REMINDER_AUTOMATIONS_QUERY_KEY });
      onRefresh?.();
    } catch {
      /* el dashboard se refresca en el siguiente ciclo */
    } finally {
      setToggleLoadingKey(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Próximo envío
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Citas elegibles para el run de las 6 PM (servicio mañana) sin timestamp de envío.
          </Typography>
          <ReminderTrackingTable
            rows={upcoming}
            onViewDetail={setDetailRow}
            onToggleReminder={(row, enabled) => void handleToggleReminder(row, enabled)}
            toggleLoadingKey={toggleLoadingKey}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Último envío
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Citas de hoy — batch del run anterior cruzado con whatsapp_message_log.
          </Typography>
          <ReminderTrackingTable rows={lastRun} onViewDetail={setDetailRow} />
        </CardContent>
      </Card>

      <ReminderMessageDetailDialog
        row={detailRow}
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        onRetrySuccess={onRefresh}
      />
    </Box>
  );
};

export default ReminderRecipientPanel;
