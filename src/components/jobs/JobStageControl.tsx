import React, { useState } from 'react';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
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

interface JobStageControlProps {
  value: string;
  disabled?: boolean;
  onChange: (next: JobStageChange) => Promise<void> | void;
  onHire?: () => void;
}

export const JobStageControl: React.FC<JobStageControlProps> = ({
  value,
  disabled,
  onChange,
  onHire,
}) => {
  const [draft, setDraft] = useState<JobApplicationStage | null>(null);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (next: JobStageChange) => {
    setPending(true);
    setError('');
    try {
      await onChange(next);
      setDraft(null);
      setWhen('');
      setNote('');
      setHint('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la etapa');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack
      spacing={1}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <TextField
        select
        size="small"
        hiddenLabel
        aria-label="Etapa"
        value={isJobApplicationStage(value) ? value : ''}
        disabled={disabled || pending}
        onChange={(event) => {
          const next = event.target.value as JobApplicationStage;
          const prompt = jobStagePrompt(next);
          setHint('');
          setError('');
          if (prompt === 'immediate') {
            setDraft(next);
            return;
          }
          if (prompt === 'hire') {
            setDraft(null);
            setHint('Para contratar, vincula un miembro de Equipo.');
            onHire?.();
            return;
          }
          setDraft(next);
        }}
      >
        {JOB_APPLICATION_STAGES.map((stage) => (
          <MenuItem key={stage} value={stage}>
            {JOB_STAGE_LABELS[stage]}
          </MenuItem>
        ))}
      </TextField>
      {draft && jobStagePrompt(draft) === 'immediate' ? (
        <Button
          size="small"
          variant="contained"
          disabled={pending}
          onClick={() => void submit({ stage: draft })}
        >
          Mover
        </Button>
      ) : null}
      {draft === 'interview_scheduled' ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            type="datetime-local"
            label="Fecha"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            disabled={!when || pending}
            onClick={() => {
              const parsed = new Date(when);
              if (Number.isNaN(parsed.getTime())) return;
              void submit({ stage: 'interview_scheduled', interviewAt: parsed.toISOString() });
            }}
          >
            Programar
          </Button>
        </Stack>
      ) : null}
      {draft && jobStagePrompt(draft) === 'note' ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            label="Nota"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            disabled={!note.trim() || pending}
            onClick={() => void submit({ stage: draft, note: note.trim() })}
          >
            Guardar
          </Button>
        </Stack>
      ) : null}
      {hint ? <Typography variant="caption">{hint}</Typography> : null}
      {error ? (
        <Typography variant="caption" color="error">{error}</Typography>
      ) : null}
    </Stack>
  );
};
