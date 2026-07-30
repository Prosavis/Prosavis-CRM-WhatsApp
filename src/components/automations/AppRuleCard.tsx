/**
 * Card de regla de app (chat / push / tarea).
 */

import React, { useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { DesignTokens } from '@/constants/designSystem';
import type { AutomationRule } from '@/types/automations';

const TRIGGER_LABELS: Record<string, string> = {
  appointment_completed: 'Cita completada',
  appointment_cancelled: 'Cita cancelada',
  appointment_reminder_client: 'Recordatorio — cliente',
  appointment_reminder_professional: 'Recordatorio — profesional',
  client_first_appointment: 'Primera cita',
  review_request: 'Solicitud de reseña',
};

const ACTION_LABELS: Record<string, string> = {
  send_chat_message: 'Chat in-app',
  send_push_notification: 'Push',
  create_task: 'Tarea',
};

function getDelayLabel(delay: { value: number; unit: string }): string {
  if (!delay || delay.value <= 0) return 'inmediato';
  if (delay.unit === 'hours') {
    return delay.value === 1 ? '1 h' : `${delay.value} h`;
  }
  return delay.value === 1 ? '1 min' : `${delay.value} min`;
}

function getRuleDescription(rule: AutomationRule): string {
  const actionLabel = ACTION_LABELS[rule.action.type] ?? rule.action.type;
  const delayLabel = getDelayLabel(rule.delay);
  const trigger = rule.trigger;
  if (
    trigger.type === 'appointment_reminder_client' ||
    trigger.type === 'appointment_reminder_professional'
  ) {
    const h = trigger.hoursBeforeAppointment ?? 24;
    const recipient =
      trigger.type === 'appointment_reminder_client' ? 'cliente' : 'profesional';
    return `${h} h antes → ${actionLabel} al ${recipient}`;
  }
  if (trigger.type === 'client_first_appointment') {
    return `Primera cita → ${actionLabel}`;
  }
  if (trigger.type === 'review_request') {
    return `${delayLabel} tras completar → ${actionLabel}`;
  }
  const triggerLabel = TRIGGER_LABELS[trigger.type] ?? trigger.type;
  return `${triggerLabel} → ${actionLabel} (${delayLabel})`;
}

export interface AppRuleCardProps {
  rule: AutomationRule;
  onEdit: (rule: AutomationRule) => void;
  onToggle: (ruleId: string, isActive: boolean) => void;
  onDelete: (ruleId: string) => void;
}

const AppRuleCard: React.FC<AppRuleCardProps> = ({
  rule,
  onEdit,
  onToggle,
  onDelete,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        borderRadius: DesignTokens.borderRadius.lg,
        border: 1,
        borderColor: 'divider',
        bgcolor: rule.isActive ? 'action.hover' : 'background.paper',
        opacity: rule.isActive ? 1 : 0.72,
      }}
    >
      <Switch
        checked={rule.isActive}
        onChange={(e) => onToggle(rule.id, e.target.checked)}
        color="primary"
        size="small"
        inputProps={{ 'aria-label': `Activar ${rule.name}` }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          {rule.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {getRuleDescription(rule)}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
          <Chip
            size="small"
            label={TRIGGER_LABELS[rule.trigger.type] ?? rule.trigger.type}
            sx={{ fontWeight: 600 }}
          />
          <Chip
            size="small"
            label={ACTION_LABELS[rule.action.type] ?? rule.action.type}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          <Chip
            size="small"
            label={`${rule.executionCount} ejec.`}
            variant="outlined"
          />
        </Box>
      </Box>
      <IconButton
        size="small"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label="Más acciones"
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem
          onClick={() => {
            onEdit(rule);
            setAnchorEl(null);
          }}
        >
          <EditIcon sx={{ mr: 1, fontSize: 20 }} />
          Editar
        </MenuItem>
        <MenuItem
          onClick={() => {
            onToggle(rule.id, !rule.isActive);
            setAnchorEl(null);
          }}
        >
          {rule.isActive ? (
            <>
              <PauseIcon sx={{ mr: 1, fontSize: 20 }} />
              Pausar
            </>
          ) : (
            <>
              <PlayIcon sx={{ mr: 1, fontSize: 20 }} />
              Activar
            </>
          )}
        </MenuItem>
        <MenuItem
          onClick={() => {
            onDelete(rule.id);
            setAnchorEl(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1, fontSize: 20 }} />
          Eliminar
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default AppRuleCard;
