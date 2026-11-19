import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { LOSS_REASON_CHOICES, type LossReason } from '@/services/lossReasonService';

interface ArchiveLossReasonDialogProps {
  open: boolean;
  count: number;
  saving: boolean;
  onClose: () => void;
  onChoose: (reason: LossReason) => void;
}

export const ArchiveLossReasonDialog: React.FC<ArchiveLossReasonDialogProps> = ({
  open,
  count,
  saving,
  onClose,
  onChoose,
}) => (
  <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Motivo de pérdida</DialogTitle>
    <DialogContent>
      <DialogContentText>
        {count > 1
          ? `Estos ${count} chats de venta necesitan un motivo. El que elijas se guarda en ellos y después se archivan.`
          : 'Este chat de venta necesita un motivo de pérdida para archivarse.'}
      </DialogContentText>
      <List dense>
        {LOSS_REASON_CHOICES.map((choice) => (
          <ListItemButton
            key={choice.id}
            disabled={saving}
            onClick={() => onChoose(choice.id)}
          >
            <ListItemText primary={choice.label} />
          </ListItemButton>
        ))}
      </List>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Cancelar</Button>
    </DialogActions>
  </Dialog>
);
