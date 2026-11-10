import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PROSAVIS_CLEANING_SERVICE_ID } from '@/constants/cleaningService';
import { JobStageControl } from '@/components/jobs/JobStageControl';
import {
  useJobApplicationDetail,
  useJobApplicationMutations,
  useJobTeamMembers,
} from '@/hooks/useJobApplicationsQueries';
import { getJobDocumentSignedUrl } from '@/services/jobApplicationsService';
import {
  DEFAULT_RUBRIC_CRITERIA,
  jobStageLabel,
  maskDocumentNumber,
} from '@/utils/jobApplicationsDomain';
import { applyWhatsAppTab } from '@/utils/whatsappTabs';

interface JobApplicationDetailProps {
  applicationId: string;
  onClose: () => void;
}

interface ScoreEntry {
  score?: number;
  evidence?: string[];
}

export const JobApplicationDetailPanel: React.FC<JobApplicationDetailProps> = ({
  applicationId,
  onClose,
}) => {
  const [, setSearchParams] = useSearchParams();
  const detail = useJobApplicationDetail(applicationId);
  const team = useJobTeamMembers();
  const mutations = useJobApplicationMutations();
  const [splitName, setSplitName] = useState('');
  const [memberId, setMemberId] = useState('');
  const application = detail.data?.application;
  const candidate = (application?.candidate ?? null) as {
    full_name?: string;
    phone?: string | null;
    email?: string | null;
    document_number?: string | null;
  } | null;
  const events = useMemo(
    () => (Array.isArray(application?.events) ? application.events : []) as Array<{
      id: string;
      event_type: string;
      actor_label?: string;
      created_at: string;
      to_stage?: string | null;
      payload?: { note?: string | null };
    }>,
    [application],
  );
  const documents = useMemo(
    () => (Array.isArray(application?.documents) ? application.documents : []) as Array<{
      id: string;
      role: string;
      asset?: { id: string; original_filename?: string | null; kind?: string };
    }>,
    [application],
  );
  const chatKey = useMemo(() => {
    const sources = (Array.isArray(application?.sources) ? application.sources : []) as Array<{
      conversation_stable_key?: string | null;
    }>;
    return sources.find((source) => source.conversation_stable_key)?.conversation_stable_key ?? null;
  }, [application]);
  const latestScores = useMemo(() => {
    const evaluations = (Array.isArray(application?.evaluations) ? application.evaluations : []) as Array<{
      created_at?: string;
      summary?: string | null;
      scores?: Record<string, ScoreEntry>;
    }>;
    return [...evaluations].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
  }, [application]);
  const analyses = detail.data?.analyses ?? [];
  const summary = latestScores?.summary
    ?? (analyses[0]?.result as { summary?: string } | undefined)?.summary
    ?? '';

  if (detail.isPending) {
    return <Typography sx={{ p: 2 }}>Cargando expediente…</Typography>;
  }
  if (!application) {
    return <Typography sx={{ p: 2 }}>No se encontró la solicitud.</Typography>;
  }

  const openChat = () => {
    if (!chatKey) return;
    setSearchParams((prev) => {
      const next = applyWhatsAppTab(prev, 'inbox');
      next.set('conversation', chatKey);
      next.delete('applicationId');
      return next;
    });
  };

  return (
    <Box data-testid="jobs-detail" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">{candidate?.full_name ?? 'Expediente'}</Typography>
        <Button onClick={onClose}>Cerrar</Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Chip label={jobStageLabel(String(application.stage))} />
        <Chip label={String(application.cohort)} variant="outlined" />
        {application.needs_review ? <Chip color="warning" label="Por revisar" /> : null}
        {application.needs_stage_review && application.legacy_stage ? (
          <Chip variant="outlined" label={`Antes: ${jobStageLabel(String(application.legacy_stage))}`} />
        ) : null}
      </Stack>
      <Typography variant="body2">Teléfono: {candidate?.phone ?? '—'}</Typography>
      <Typography variant="body2">Correo: {candidate?.email ?? '—'}</Typography>
      <Typography variant="body2">
        Documento: {maskDocumentNumber(candidate?.document_number)}
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Alta: {application.created_by_label ?? '—'} · {application.origin_label ?? ''}
      </Typography>
      {application.interview_at ? (
        <Typography variant="body2" sx={{ mb: 1 }}>
          Cita: {new Date(String(application.interview_at)).toLocaleString('es-CO', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </Typography>
      ) : null}
      {chatKey ? (
        <Button size="small" sx={{ mb: 2 }} onClick={openChat}>Abrir chat</Button>
      ) : null}

      <JobStageControl
        value={String(application.stage)}
        disabled={mutations.transition.isPending}
        onChange={async (change) => {
          await mutations.transition.mutateAsync({
            id: applicationId,
            stage: change.stage,
            note: change.note,
            interviewAt: change.interviewAt,
          });
        }}
      />

      <TextField
        select
        fullWidth
        label="Vincular a Equipo (Contratada)"
        value={memberId}
        sx={{ mt: 2, mb: 1 }}
        onChange={(event) => setMemberId(event.target.value)}
      >
        {(team.data?.members ?? []).map((member) => (
          <MenuItem key={`${member.service_id}:${member.id}`} value={`${member.service_id}:${member.id}`}>
            {member.name}
          </MenuItem>
        ))}
      </TextField>
      <Button
        variant="contained"
        disabled={!memberId || mutations.hire.isPending}
        onClick={() => {
          const [serviceId, id] = memberId.split(':');
          void mutations.hire.mutateAsync({
            id: applicationId,
            serviceId: serviceId || PROSAVIS_CLEANING_SERVICE_ID,
            memberId: id,
          });
        }}
      >
        Marcar contratada
      </Button>

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2">Separar otra candidata</Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2 }}>
        <TextField
          size="small"
          label="Nombre"
          value={splitName}
          onChange={(event) => setSplitName(event.target.value)}
        />
        <Button
          disabled={!splitName.trim()}
          onClick={() => {
            void mutations.split.mutateAsync({ id: applicationId, fullName: splitName.trim() });
            setSplitName('');
          }}
        >
          Separar
        </Button>
      </Stack>

      <Typography variant="subtitle2">Documentos</Typography>
      {documents.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Sin hoja de vida.</Typography>
      ) : documents.map((doc) => (
        <Button
          key={doc.id}
          size="small"
          onClick={async () => {
            if (!doc.asset?.id) return;
            const { url } = await getJobDocumentSignedUrl(doc.asset.id);
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
        >
          {doc.asset?.original_filename || doc.role}
        </Button>
      ))}

      <Typography variant="subtitle2" sx={{ mt: 2 }}>Análisis</Typography>
      {summary ? <Typography variant="body2" sx={{ mb: 1 }}>{summary}</Typography> : (
        <Typography variant="body2" color="text.secondary">Aún no hay análisis.</Typography>
      )}
      {DEFAULT_RUBRIC_CRITERIA.map((criterion) => {
        const entry = latestScores?.scores?.[criterion.key];
        const evidence = entry?.evidence?.filter(Boolean) ?? [];
        return (
          <Box key={criterion.key} sx={{ mb: 1 }}>
            <Typography variant="body2" fontWeight={600}>{criterion.label}</Typography>
            {evidence.length === 0 ? (
              <Typography variant="caption" color="text.secondary">Sin evidencia citada</Typography>
            ) : evidence.map((line) => (
              <Typography key={line} variant="body2">{line}</Typography>
            ))}
          </Box>
        );
      })}

      <Typography variant="subtitle2" sx={{ mt: 2 }}>Timeline</Typography>
      {events.map((event) => (
        <Typography key={event.id} variant="body2">
          {new Date(event.created_at).toLocaleString('es-CO')} · {event.event_type}
          {event.to_stage ? ` → ${jobStageLabel(event.to_stage)}` : ''}
          {event.payload?.note ? ` · ${event.payload.note}` : ''}
          {' · '}{event.actor_label}
        </Typography>
      ))}

      <Button
        color="error"
        sx={{ mt: 2 }}
        onClick={() => {
          void mutations.remove.mutateAsync(applicationId).then(onClose);
        }}
      >
        Eliminar expediente
      </Button>
    </Box>
  );
};
