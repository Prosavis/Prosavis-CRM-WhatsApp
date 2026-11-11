import React, { useState } from 'react';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { format } from 'date-fns';
import type { JobTeamMember } from '@/types/jobApplications';
import {
  JOB_APPLICATION_STAGES,
  JOB_STAGE_LABELS,
  isJobApplicationStage,
  jobStagePrompt,
  type JobApplicationStage,
} from '@/utils/jobApplicationsDomain';

export interface JobStageChange {
  stage: JobApplicationStage;
  note?: string;
  interviewAt?: string;
}

export interface JobHireChoice {
  serviceId: string;
  memberId: string;
}

interface JobStageControlProps {
  value: string;
  interviewAt?: string | null;
  hasTeamMember: boolean;
  teamMembers: JobTeamMember[];
  disabled?: boolean;
  onChange: (next: JobStageChange) => Promise<void> | void;
  onHire: (member: JobHireChoice) => Promise<void> | void;
}

const STAGE_ERRORS: Record<string, string> = {
  'interview requires a date': 'Elige la fecha y la hora.',
  'a note is required': 'Escribe el motivo.',
  'hired requires a team member link': 'Elige a la persona del equipo.',
  'team member not found': 'Esa persona ya no está en Equipo.',
  'application not found': 'No se encontró la solicitud.',
};

function stageErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  for (const [key, message] of Object.entries(STAGE_ERRORS)) {
    if (raw.includes(key)) return message;
  }
  return 'No se pudo guardar el cambio. Intenta de nuevo.';
}

function localDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function noteQuestion(stage: JobApplicationStage): string | null {
  switch (stage) {
    case 'interview_declined':
      return '¿Por qué no acepta la entrevista?';
    case 'no_show':
      return '¿Qué pasó?';
    case 'rejected':
      return '¿Por qué se rechaza?';
    case 'despedida':
      return '¿Por qué se despide?';
    case 'inbound':
    case 'interview_pending':
    case 'interview_scheduled':
    case 'hired':
      return null;
    default: {
      const unreachable: never = stage;
      return unreachable;
    }
  }
}

export const JobStageControl: React.FC<JobStageControlProps> = ({
  value,
  interviewAt,
  hasTeamMember,
  teamMembers,
  disabled,
  onChange,
  onHire,
}) => {
  const [choice, setChoice] = useState<JobApplicationStage | null>(null);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [memberKey, setMemberKey] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const saved = isJobApplicationStage(value) ? value : null;
  const shown = choice ?? saved ?? '';
  const prompt = choice ? jobStagePrompt(choice) : null;
  const needsDate = prompt === 'date';
  const needsNote = prompt === 'note';
  const needsMember = prompt === 'hire' && !hasTeamMember;
  const selectedMember = teamMembers.find((member) => `${member.service_id}:${member.id}` === memberKey);
  const dateReady = when !== '' && !Number.isNaN(new Date(when).getTime());
  const canSave = !pending && (
    (needsDate && dateReady)
    || (needsNote && note.trim().length > 0)
    || (needsMember && Boolean(selectedMember))
  );

  const clearDraft = () => {
    setChoice(null);
    setWhen('');
    setNote('');
    setMemberKey('');
  };

  const run = async (action: () => Promise<void> | void) => {
    setPending(true);
    setError('');
    try {
      await action();
      clearDraft();
    } catch (err) {
      clearDraft();
      setError(stageErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const pick = (next: JobApplicationStage) => {
    if (pending || disabled) return;
    setError('');
    if (saved === next && next !== 'interview_scheduled') return;
    const nextPrompt = jobStagePrompt(next);
    if (nextPrompt === 'immediate' || (nextPrompt === 'hire' && hasTeamMember)) {
      setChoice(next);
      setWhen('');
      setNote('');
      setMemberKey('');
      void run(() => onChange({ stage: next }));
      return;
    }
    setChoice(next);
    setNote('');
    setMemberKey('');
    setWhen(nextPrompt === 'date' ? localDateTime(interviewAt) : '');
  };

  const save = () => {
    if (!choice || !canSave) return;
    if (needsDate) {
      void run(() => onChange({
        stage: 'interview_scheduled',
        interviewAt: new Date(when).toISOString(),
      }));
      return;
    }
    if (needsNote) {
      void run(() => onChange({ stage: choice, note: note.trim() }));
      return;
    }
    if (needsMember && selectedMember) {
      void run(() => onHire({
        serviceId: selectedMember.service_id,
        memberId: selectedMember.id,
      }));
    }
  };

  return (
    <Stack
      spacing={1}
      sx={{ width: '100%' }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <TextField
        select
        fullWidth
        size="small"
        label="Etapa"
        value={shown}
        disabled={disabled || pending}
        InputLabelProps={{ shrink: true }}
        SelectProps={{ displayEmpty: true }}
        onChange={(event) => {
          const next = event.target.value;
          if (!isJobApplicationStage(next)) return;
          pick(next);
        }}
      >
        {shown === '' ? (
          <MenuItem value="" disabled>
            Elegir etapa
          </MenuItem>
        ) : null}
        {JOB_APPLICATION_STAGES.map((stage) => (
          <MenuItem key={stage} value={stage}>
            {JOB_STAGE_LABELS[stage]}
          </MenuItem>
        ))}
      </TextField>

      {saved === 'interview_scheduled' && !choice ? (
        <Button
          size="small"
          disabled={disabled || pending}
          onClick={() => {
            setError('');
            setChoice('interview_scheduled');
            setWhen(localDateTime(interviewAt));
            setNote('');
            setMemberKey('');
          }}
        >
          Cambiar fecha
        </Button>
      ) : null}

      {needsDate ? (
        <TextField
          fullWidth
          size="small"
          type="datetime-local"
          label="Fecha y hora de la entrevista"
          value={when}
          disabled={pending}
          onChange={(event) => setWhen(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      ) : null}

      {needsNote && choice ? (
        <Stack spacing={0.5}>
          <TextField
            fullWidth
            size="small"
            label={noteQuestion(choice) ?? 'Motivo'}
            value={note}
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
          />
          {choice === 'despedida' ? (
            <Typography variant="caption" color="text.secondary">
              También se marca el contacto con la etiqueta Despedida.
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      {needsMember ? (
        teamMembers.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No hay personas activas en Equipo. Agrégala primero en Equipo.
          </Typography>
        ) : (
          <TextField
            select
            fullWidth
            size="small"
            label="Persona del equipo"
            value={memberKey}
            disabled={pending}
            onChange={(event) => setMemberKey(event.target.value)}
          >
            {teamMembers.map((member) => (
              <MenuItem key={`${member.service_id}:${member.id}`} value={`${member.service_id}:${member.id}`}>
                {member.name}
              </MenuItem>
            ))}
          </TextField>
        )
      ) : null}

      {needsDate || needsNote || needsMember ? (
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" disabled={!canSave} onClick={save}>
            Guardar
          </Button>
          <Button
            size="small"
            disabled={pending}
            onClick={() => {
              clearDraft();
              setError('');
            }}
          >
            Cancelar
          </Button>
        </Stack>
      ) : null}

      {error ? (
        <Typography variant="caption" color="error">{error}</Typography>
      ) : null}
    </Stack>
  );
};
