import React, { useMemo, useState } from 'react';
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
import {
  useJobApplicationDetail,
  useJobApplicationMutations,
  useJobTeamMembers,
} from '@/hooks/useJobApplicationsQueries';
import { getJobDocumentSignedUrl } from '@/services/jobApplicationsService';
import {
  JOB_APPLICATION_STAGES,
  JOB_STAGE_LABELS,
  jobStageLabel,
  maskDocumentNumber,
  type JobApplicationStage,
} from '@/utils/jobApplicationsDomain';

interface JobApplicationDetailProps {
  applicationId: string;
  onClose: () => void;
}

export const JobApplicationDetailPanel: React.FC<JobApplicationDetailProps> = ({
  applicationId,
  onClose,
}) => {
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
  const analyses = detail.data?.analyses ?? [];

  if (detail.isPending) {
    return <Typography sx={{ p: 2 }}>Cargando expediente…</Typography>;
  }
  if (!application) {
    return <Typography sx={{ p: 2 }}>No se encontró la solicitud.</Typography>;
  }

  return (
    <Box data-testid="jobs-detail" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">{candidate?.full_name ?? 'Expediente'}</Typography>
        <Button onClick={onClose}>Cerrar</Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <Chip label={jobStageLabel(String(application.stage))} />
        <Chip label={String(application.cohort)} variant="outlined" />
        {application.needs_review ? <Chip color="warning" label="Por revisar" /> : null}
      </Stack>
      <Typography variant="body2">Teléfono: {candidate?.phone ?? '—'}</Typography>
      <Typography variant="body2">Correo: {candidate?.email ?? '—'}</Typography>
      <Typography variant="body2">
        Documento: {maskDocumentNumber(candidate?.document_number)}
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Alta: {application.created_by_label ?? '—'} · {application.origin_label ?? ''}
      </Typography>

      <TextField
        select
        fullWidth
        label="Etapa"
        value={String(application.stage)}
        sx={{ mb: 2 }}
        onChange={(event) => {
          void mutations.transition.mutateAsync({
            id: applicationId,
            stage: event.target.value,
          });
        }}
      >
        {JOB_APPLICATION_STAGES.map((stage: JobApplicationStage) => (
          <MenuItem key={stage} value={stage} disabled={stage === 'hired'}>
            {JOB_STAGE_LABELS[stage]}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        fullWidth
        label="Vincular a Equipo (Contratada)"
        value={memberId}
        sx={{ mb: 1 }}
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
      {documents.map((doc) => (
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

      <Typography variant="subtitle2" sx={{ mt: 2 }}>Hechos y evidencia</Typography>
      {analyses.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Aún no hay análisis.</Typography>
      ) : (
        analyses.map((analysis) => (
          <Box key={String(analysis.id)} sx={{ my: 1 }}>
            <Typography variant="caption">{String(analysis.kind)}</Typography>
            <Typography variant="body2">
              {String((analysis.result as { summary?: string } | undefined)?.summary ?? '')}
            </Typography>
          </Box>
        ))
      )}

      <Typography variant="subtitle2" sx={{ mt: 2 }}>Timeline</Typography>
      {events.map((event) => (
        <Typography key={event.id} variant="body2">
          {new Date(event.created_at).toLocaleString('es-CO')} · {event.event_type}
          {event.to_stage ? ` → ${jobStageLabel(event.to_stage)}` : ''} · {event.actor_label}
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
