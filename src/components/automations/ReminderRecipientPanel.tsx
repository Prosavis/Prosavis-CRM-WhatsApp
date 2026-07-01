import React, { useState } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import type { ReminderRecipientType, ReminderRow } from '@/types/reminderAutomations';
import ReminderTrackingTable from './ReminderTrackingTable';
import ReminderMessageDetailDialog from './ReminderMessageDetailDialog';

export interface ReminderRecipientPanelProps {
  recipientType: ReminderRecipientType;
  upcoming: ReminderRow[];
  lastRun: ReminderRow[];
}

const ReminderRecipientPanel: React.FC<ReminderRecipientPanelProps> = ({
  upcoming,
  lastRun,
}) => {
  const [detailRow, setDetailRow] = useState<ReminderRow | null>(null);

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
          <ReminderTrackingTable rows={upcoming} onViewDetail={setDetailRow} />
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
      />
    </Box>
  );
};

export default ReminderRecipientPanel;
