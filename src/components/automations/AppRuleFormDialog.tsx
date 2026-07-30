/**
 * Wizard 3 pasos: Disparador → Acción → Revisión (reglas de app).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Notifications as NotificationsIcon,
  TaskAlt as TaskIcon,
} from '@mui/icons-material';
import { DesignTokens } from '@/constants/designSystem';
import type {
  AutomationActionConfig,
  AutomationActionType,
  AutomationRule,
  AutomationTriggerType,
  CreateAutomationPayload,
  CreateTaskActionConfig,
  SendChatMessageActionConfig,
  SendPushNotificationActionConfig,
} from '@/types/automations';
import { REMINDER_HOURS_OPTIONS, TRIGGER_ACTION_COMPATIBILITY } from '@/types/automations';

const STEPS = ['Disparador', 'Acción', 'Revisión'];

const TRIGGER_OPTIONS: { value: AutomationTriggerType; label: string }[] = [
  { value: 'appointment_completed', label: 'Cita completada' },
  { value: 'appointment_cancelled', label: 'Cita cancelada' },
  { value: 'appointment_reminder_client', label: 'X horas antes — cliente' },
  { value: 'appointment_reminder_professional', label: 'X horas antes — profesional' },
  { value: 'client_first_appointment', label: 'Primera cita de un cliente nuevo' },
  { value: 'review_request', label: 'Solicitud de reseña post-servicio' },
];

const REVIEW_REQUEST_DEFAULT_BODY =
  '¿Cómo fue tu experiencia con {{serviceTitle}}? Tu opinión nos ayuda a mejorar.';

const ACTION_OPTIONS: {
  value: AutomationActionType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: 'send_chat_message',
    label: 'Mensaje al chat',
    icon: <ChatIcon />,
    description: 'Mensaje automático al cliente en el chat de la app',
  },
  {
    value: 'send_push_notification',
    label: 'Notificación push',
    icon: <NotificationsIcon />,
    description: 'Push al cliente o profesional',
  },
  {
    value: 'create_task',
    label: 'Crear tarea',
    icon: <TaskIcon />,
    description: 'Tarea operativa en el CRM del servicio',
  },
];

const VARIABLE_CHIPS = [
  '{{clientName}}',
  '{{serviceTitle}}',
  '{{scheduledDate}}',
  '{{providerName}}',
  '{{hoursUntilAppointment}}',
];

type TaskType = CreateTaskActionConfig['taskType'];
type TaskPriority = CreateTaskActionConfig['taskPriority'];

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'call', label: 'Llamada' },
  { value: 'followup', label: 'Seguimiento' },
  { value: 'admin', label: 'Administrativo' },
  { value: 'other', label: 'Otro' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
];

function getDelayLabel(delay: { value: number; unit: string }): string {
  if (!delay || delay.value <= 0) return 'inmediatamente';
  if (delay.unit === 'hours') {
    return delay.value === 1 ? '1 hora' : `${delay.value} horas`;
  }
  return delay.value === 1 ? '1 minuto' : `${delay.value} minutos`;
}

export interface AppRuleFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateAutomationPayload) => void | Promise<void>;
  initialValues?: AutomationRule;
  submitting?: boolean;
}

const AppRuleFormDialog: React.FC<AppRuleFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  initialValues,
  submitting = false,
}) => {
  const isEdit = !!initialValues;
  const [activeStep, setActiveStep] = useState(0);
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] =
    useState<AutomationTriggerType>('appointment_completed');
  const [hoursBeforeAppointment, setHoursBeforeAppointment] = useState(24);
  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState<'minutes' | 'hours'>('minutes');
  const [actionType, setActionType] =
    useState<AutomationActionType>('send_chat_message');
  const [actionConfig, setActionConfig] = useState<AutomationActionConfig>({
    messageTemplate: '',
    recipient: 'client',
  });
  const [confirmed, setConfirmed] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const messageTemplateInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const bodyTemplateInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const taskTitleInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const FIELD_LIMITS: Record<string, number> = {
    messageTemplate: 500,
    bodyTemplate: 200,
    title: 50,
    taskTitle: 500,
  };

  useEffect(() => {
    if (!open) return;
    setActiveStep(0);
    setConfirmed(false);
    setName(initialValues?.name ?? '');
    setTriggerType(initialValues?.trigger?.type ?? 'appointment_completed');
    setHoursBeforeAppointment(initialValues?.trigger?.hoursBeforeAppointment ?? 24);
    setDelayValue(initialValues?.delay?.value ?? 0);
    setDelayUnit(initialValues?.delay?.unit ?? 'minutes');
    setActionType(initialValues?.action.type ?? 'send_chat_message');
    setActionConfig(
      initialValues?.actionConfig ?? { messageTemplate: '', recipient: 'client' },
    );
  }, [open, initialValues]);

  useEffect(() => {
    if (activeStep !== 1) return;
    const compatible = TRIGGER_ACTION_COMPATIBILITY[triggerType] ?? [];
    if (compatible.length === 1 && !compatible.includes(actionType)) {
      const single = compatible[0];
      setActionType(single);
      if (single === 'send_chat_message') {
        setActionConfig({ messageTemplate: '', recipient: 'client' });
      } else if (single === 'send_push_notification') {
        setActionConfig({ title: '', bodyTemplate: '', recipient: 'client' });
      }
    }
  }, [activeStep, triggerType, actionType]);

  const insertVariable = (variable: string) => {
    type FieldKey = 'messageTemplate' | 'bodyTemplate' | 'title' | 'taskTitle';
    const effectiveField: FieldKey | null =
      (focusedField as FieldKey) ??
      (actionType === 'send_chat_message'
        ? 'messageTemplate'
        : actionType === 'send_push_notification'
          ? 'title'
          : actionType === 'create_task'
            ? 'taskTitle'
            : null);

    const fieldConfig: Record<
      FieldKey,
      {
        ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
        get: () => string;
        set: (v: string) => void;
      }
    > = {
      messageTemplate: {
        ref: messageTemplateInputRef,
        get: () => (actionConfig as SendChatMessageActionConfig).messageTemplate,
        set: (v) =>
          setActionConfig({ messageTemplate: v, recipient: 'client' }),
      },
      bodyTemplate: {
        ref: bodyTemplateInputRef,
        get: () => (actionConfig as SendPushNotificationActionConfig).bodyTemplate ?? '',
        set: (v) =>
          setActionConfig(
            (prev) =>
              ({ ...prev, bodyTemplate: v }) as SendPushNotificationActionConfig,
          ),
      },
      title: {
        ref: titleInputRef,
        get: () => (actionConfig as SendPushNotificationActionConfig).title ?? '',
        set: (v) =>
          setActionConfig(
            (prev) => ({ ...prev, title: v }) as SendPushNotificationActionConfig,
          ),
      },
      taskTitle: {
        ref: taskTitleInputRef,
        get: () => (actionConfig as CreateTaskActionConfig).taskTitle ?? '',
        set: (v) =>
          setActionConfig(
            (prev) => ({ ...prev, taskTitle: v }) as CreateTaskActionConfig,
          ),
      },
    };

    const cfg = effectiveField && fieldConfig[effectiveField];
    if (!cfg) return;

    const input = cfg.ref.current;
    const current = cfg.get();
    const limit = FIELD_LIMITS[effectiveField] ?? 500;
    const start =
      input && typeof input.selectionStart === 'number'
        ? input.selectionStart
        : current.length;
    const end =
      input && typeof input.selectionEnd === 'number'
        ? input.selectionEnd
        : start;
    const truncated = (current.slice(0, start) + variable + current.slice(end)).slice(
      0,
      limit,
    );
    cfg.set(truncated);
    const newPos = Math.min(start + variable.length, truncated.length);
    requestAnimationFrame(() => {
      cfg.ref.current?.focus();
      cfg.ref.current?.setSelectionRange(newPos, newPos);
    });
  };

  const isReminderTrigger =
    triggerType === 'appointment_reminder_client' ||
    triggerType === 'appointment_reminder_professional';

  const canProceedStep0 =
    name.trim().length > 0 &&
    delayValue >= 0 &&
    (delayUnit === 'hours' ? delayValue <= 72 : true) &&
    (!isReminderTrigger ||
      (REMINDER_HOURS_OPTIONS as readonly number[]).includes(hoursBeforeAppointment));

  const canProceedStep1 = (() => {
    if (actionType === 'send_chat_message') {
      return (actionConfig as SendChatMessageActionConfig).messageTemplate.trim().length > 0;
    }
    if (actionType === 'send_push_notification') {
      const c = actionConfig as SendPushNotificationActionConfig;
      return c.title?.trim().length > 0 && c.bodyTemplate?.trim().length > 0;
    }
    if (actionType === 'create_task') {
      return (actionConfig as CreateTaskActionConfig).taskTitle.trim().length > 0;
    }
    return false;
  })();

  const handleSubmit = async () => {
    const trigger: CreateAutomationPayload['trigger'] = { type: triggerType };
    if (isReminderTrigger) {
      trigger.hoursBeforeAppointment = hoursBeforeAppointment;
    }
    await onSubmit({
      name: name.trim(),
      trigger,
      delay: { value: Math.max(0, Math.min(delayValue, 72)), unit: delayUnit },
      action: { type: actionType },
      actionConfig,
    });
    onClose();
  };

  const getSummary = () => {
    const actionLabel =
      ACTION_OPTIONS.find((o) => o.value === actionType)?.label ?? actionType;
    const delayLabel = getDelayLabel({ value: delayValue, unit: delayUnit });
    if (isReminderTrigger) {
      const recipient =
        triggerType === 'appointment_reminder_client' ? 'al cliente' : 'al profesional';
      return `${hoursBeforeAppointment} horas antes de cada cita → ${actionLabel} ${recipient}.`;
    }
    if (triggerType === 'client_first_appointment') {
      return `Cuando un cliente agenda por primera vez → ${actionLabel}`;
    }
    if (triggerType === 'review_request') {
      return `${delayLabel} después de completar un servicio → ${actionLabel} al cliente`;
    }
    const triggerLabel =
      TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.label ?? triggerType;
    return `Cuando ${triggerLabel}, ${actionLabel} después de ${delayLabel}.`;
  };

  const compatibleActions = TRIGGER_ACTION_COMPATIBILITY[triggerType] ?? [];
  const filteredOptions = ACTION_OPTIONS.filter((o) =>
    compatibleActions.includes(o.value),
  );
  const singleActionOnly = filteredOptions.length === 1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: DesignTokens.borderRadius.lg } }}
    >
      <DialogTitle>
        {isEdit ? 'Editar regla' : 'Nueva regla de la app'}
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3, mt: 1 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nombre de la regla"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Evento que dispara</InputLabel>
              <Select
                value={triggerType}
                label="Evento que dispara"
                onChange={(e) => {
                  const v = e.target.value as AutomationTriggerType;
                  setTriggerType(v);
                  if (v === 'review_request') {
                    setDelayValue(2);
                    setDelayUnit('hours');
                    setActionType('send_push_notification');
                    setActionConfig({
                      title: '¿Cómo fue tu experiencia?',
                      bodyTemplate: REVIEW_REQUEST_DEFAULT_BODY,
                      recipient: 'client',
                    });
                  } else if (v === 'client_first_appointment') {
                    setDelayValue(0);
                    setActionType('send_chat_message');
                    setActionConfig({ messageTemplate: '', recipient: 'client' });
                  } else if (
                    v === 'appointment_reminder_client' ||
                    v === 'appointment_reminder_professional'
                  ) {
                    setActionType('send_push_notification');
                    setActionConfig({
                      title: 'Recordatorio de cita',
                      bodyTemplate:
                        'Tu cita de {{serviceTitle}} es en {{hoursUntilAppointment}} horas.',
                      recipient: 'client',
                    });
                  }
                }}
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {isReminderTrigger ? (
              <FormControl fullWidth>
                <InputLabel>¿Cuántas horas antes?</InputLabel>
                <Select
                  value={hoursBeforeAppointment}
                  label="¿Cuántas horas antes?"
                  onChange={(e) => setHoursBeforeAppointment(Number(e.target.value))}
                >
                  {REMINDER_HOURS_OPTIONS.map((h) => (
                    <MenuItem key={h} value={h}>
                      {h} {h === 1 ? 'hora' : 'horas'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Tiempo de espera"
                    type="number"
                    value={delayValue}
                    onChange={(e) =>
                      setDelayValue(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                    inputProps={{ min: 0, max: 72 }}
                    sx={{ width: 140 }}
                  />
                  <FormControl sx={{ minWidth: 120 }}>
                    <InputLabel>Unidad</InputLabel>
                    <Select
                      value={delayUnit}
                      label="Unidad"
                      onChange={(e) =>
                        setDelayUnit(e.target.value as 'minutes' | 'hours')
                      }
                    >
                      <MenuItem value="minutes">Minutos</MenuItem>
                      <MenuItem value="hours">Horas</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                {delayValue === 0 && triggerType !== 'review_request' && (
                  <Typography variant="body2" color="warning.main">
                    La acción se ejecutará inmediatamente al ocurrir el evento.
                  </Typography>
                )}
              </>
            )}
          </Box>
        )}

        {activeStep === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!singleActionOnly && (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Tipo de acción
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {filteredOptions.map((opt) => (
                    <Box
                      key={opt.value}
                      onClick={() => {
                        setActionType(opt.value);
                        if (opt.value === 'send_chat_message') {
                          setActionConfig({
                            messageTemplate: '',
                            recipient: 'client',
                          });
                        } else if (opt.value === 'send_push_notification') {
                          setActionConfig({
                            title: '',
                            bodyTemplate: '',
                            recipient: 'client',
                          });
                        } else {
                          setActionConfig({
                            taskTitle: '',
                            taskType: 'other',
                            taskPriority: 'medium',
                            assignToMember: 'provider',
                          });
                        }
                      }}
                      sx={{
                        p: 2,
                        borderRadius: DesignTokens.borderRadius.md,
                        border: `2px solid ${
                          actionType === opt.value
                            ? DesignTokens.brand.primary.orange
                            : 'transparent'
                        }`,
                        bgcolor:
                          actionType === opt.value
                            ? 'action.selected'
                            : 'background.paper',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      {opt.icon}
                      <Box>
                        <Typography fontWeight={600}>{opt.label}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {opt.description}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {(actionType === 'send_chat_message' ||
              actionType === 'send_push_notification' ||
              actionType === 'create_task') && (
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 0.5, display: 'block' }}
                >
                  Variables disponibles:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {VARIABLE_CHIPS.map((v) => (
                    <Chip
                      key={v}
                      label={v}
                      size="small"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertVariable(v)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {actionType === 'send_chat_message' && (
              <TextField
                label="Mensaje"
                multiline
                rows={3}
                inputRef={messageTemplateInputRef}
                value={(actionConfig as SendChatMessageActionConfig).messageTemplate}
                onChange={(e) =>
                  setActionConfig({
                    messageTemplate: e.target.value.slice(0, 500),
                    recipient: 'client',
                  })
                }
                onFocus={() => setFocusedField('messageTemplate')}
                onBlur={() => setFocusedField(null)}
                fullWidth
                inputProps={{ maxLength: 500 }}
              />
            )}

            {actionType === 'send_push_notification' && (
              <>
                <TextField
                  label="Título"
                  inputRef={titleInputRef}
                  value={(actionConfig as SendPushNotificationActionConfig).title ?? ''}
                  onChange={(e) =>
                    setActionConfig(
                      (prev) =>
                        ({
                          ...(prev as SendPushNotificationActionConfig),
                          title: e.target.value.slice(0, 50),
                        }) as SendPushNotificationActionConfig,
                    )
                  }
                  onFocus={() => setFocusedField('title')}
                  onBlur={() => setFocusedField(null)}
                  fullWidth
                  inputProps={{ maxLength: 50 }}
                />
                <TextField
                  label="Cuerpo"
                  multiline
                  rows={2}
                  inputRef={bodyTemplateInputRef}
                  value={
                    (actionConfig as SendPushNotificationActionConfig).bodyTemplate ?? ''
                  }
                  onChange={(e) =>
                    setActionConfig(
                      (prev) =>
                        ({
                          ...(prev as SendPushNotificationActionConfig),
                          bodyTemplate: e.target.value.slice(0, 200),
                        }) as SendPushNotificationActionConfig,
                    )
                  }
                  onFocus={() => setFocusedField('bodyTemplate')}
                  onBlur={() => setFocusedField(null)}
                  fullWidth
                  inputProps={{ maxLength: 200 }}
                />
                {triggerType !== 'review_request' && (
                  <FormControl fullWidth>
                    <InputLabel>Destinatario</InputLabel>
                    <Select
                      value={
                        (actionConfig as SendPushNotificationActionConfig).recipient ??
                        'client'
                      }
                      label="Destinatario"
                      onChange={(e) =>
                        setActionConfig(
                          (prev) =>
                            ({
                              ...(prev as SendPushNotificationActionConfig),
                              recipient: e.target.value as 'client' | 'provider',
                            }) as SendPushNotificationActionConfig,
                        )
                      }
                    >
                      <MenuItem value="client">Cliente</MenuItem>
                      <MenuItem value="provider">Proveedor</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </>
            )}

            {actionType === 'create_task' && (
              <>
                <TextField
                  label="Título de la tarea"
                  inputRef={taskTitleInputRef}
                  value={(actionConfig as CreateTaskActionConfig).taskTitle ?? ''}
                  onChange={(e) =>
                    setActionConfig(
                      (prev) =>
                        ({
                          ...(prev as CreateTaskActionConfig),
                          taskTitle: e.target.value,
                        }) as CreateTaskActionConfig,
                    )
                  }
                  onFocus={() => setFocusedField('taskTitle')}
                  onBlur={() => setFocusedField(null)}
                  fullWidth
                />
                <FormControl fullWidth>
                  <InputLabel>Tipo de tarea</InputLabel>
                  <Select
                    value={(actionConfig as CreateTaskActionConfig).taskType ?? 'other'}
                    label="Tipo de tarea"
                    onChange={(e) =>
                      setActionConfig(
                        (prev) =>
                          ({
                            ...(prev as CreateTaskActionConfig),
                            taskType: e.target.value as TaskType,
                          }) as CreateTaskActionConfig,
                      )
                    }
                  >
                    {TASK_TYPE_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>Prioridad</InputLabel>
                  <Select
                    value={
                      (actionConfig as CreateTaskActionConfig).taskPriority ?? 'medium'
                    }
                    label="Prioridad"
                    onChange={(e) =>
                      setActionConfig(
                        (prev) =>
                          ({
                            ...(prev as CreateTaskActionConfig),
                            taskPriority: e.target.value as TaskPriority,
                          }) as CreateTaskActionConfig,
                      )
                    }
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            )}
          </Box>
        )}

        {activeStep === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body1">{getSummary()}</Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
              }
              label="Entiendo que esta regla se ejecutará automáticamente para cada cita que cumpla la condición."
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={activeStep === 0 ? onClose : () => setActiveStep((s) => s - 1)}>
          {activeStep === 0 ? 'Cancelar' : 'Atrás'}
        </Button>
        {activeStep < 2 ? (
          <Button
            variant="contained"
            onClick={() => setActiveStep((s) => s + 1)}
            disabled={
              (activeStep === 0 && !canProceedStep0) ||
              (activeStep === 1 && !canProceedStep1)
            }
            sx={{ bgcolor: DesignTokens.brand.primary.orange }}
          >
            Siguiente
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={() => void handleSubmit()}
            disabled={!confirmed || submitting}
            sx={{ bgcolor: DesignTokens.brand.primary.blue }}
          >
            {isEdit ? 'Guardar cambios' : 'Crear regla'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AppRuleFormDialog;
