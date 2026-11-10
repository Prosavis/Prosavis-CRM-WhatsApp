import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Drawer,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { JobApplicationDetailPanel } from '@/components/jobs/JobApplicationDetail';
import { JobApplicationTable } from '@/components/jobs/JobApplicationTable';
import {
  useJobApplicationMutations,
  useJobApplicationsList,
  useJobApplicationsMetrics,
} from '@/hooks/useJobApplicationsQueries';
import { JOB_APPLICATION_STAGES, JOB_STAGE_LABELS, type JobApplicationStage } from '@/utils/jobApplicationsDomain';
import { applyWhatsAppTab } from '@/utils/whatsappTabs';
import type { JobApplicationListItem } from '@/types/jobApplications';

interface JobListFilters {
  priorityOnly: boolean;
  needsStageReview: boolean;
  needsReview: boolean;
  includeMarian: boolean;
  contactedFrom: string;
  contactedTo: string;
  cv: '' | 'sent' | 'missing';
}

const EMPTY_FILTERS: JobListFilters = {
  priorityOnly: false,
  needsStageReview: false,
  needsReview: false,
  includeMarian: false,
  contactedFrom: '',
  contactedTo: '',
  cv: '',
};

function activeFilterCount(filters: JobListFilters): number {
  return Number(filters.priorityOnly)
    + Number(filters.needsStageReview)
    + Number(filters.needsReview)
    + Number(filters.includeMarian)
    + Number(Boolean(filters.contactedFrom || filters.contactedTo))
    + Number(Boolean(filters.cv));
}

const JobApplicationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('applicationId');
  const [stage, setStage] = useState<string>('inbound');
  const [stageGroup, setStageGroup] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<JobListFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<JobListFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const metrics = useJobApplicationsMetrics(filters.includeMarian);
  const list = useJobApplicationsList({
    stage: stageGroup ? null : stage || null,
    stages: stageGroup,
    search,
    includeMarian: filters.includeMarian,
    needsReview: filters.needsReview,
    priorityOnly: filters.priorityOnly,
    needsStageReview: filters.needsStageReview,
    contactedFrom: filters.contactedFrom || null,
    contactedTo: filters.contactedTo || null,
    cv: filters.cv || null,
    limit,
    offset,
  });
  const mutations = useJobApplicationMutations();

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const byStage = metrics.data?.byStage ?? {};

  const openChat = (row: JobApplicationListItem) => {
    const key = row.sources?.find((source) => source.conversation_stable_key)?.conversation_stable_key;
    const digits = String(row.candidate?.phone ?? row.directory?.phone ?? '').replace(/\D/g, '');
    if (!key && !digits) return;
    setSearchParams((prev) => {
      const next = applyWhatsAppTab(prev, 'inbox');
      next.delete('applicationId');
      if (key) next.set('conversation', key);
      else {
        next.set('focusPhone', digits);
        next.set('conversation', digits);
      }
      return next;
    });
  };

  const openDetail = (id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('applicationId', id);
      else next.delete('applicationId');
      return next;
    }, { replace: true });
  };

  const selectStage = (next: string) => {
    setStage(next);
    setStageGroup(null);
    setOffset(0);
  };

  const stageSelected = (value: JobApplicationStage) =>
    stageGroup ? stageGroup.includes(value) : stage === value;

  const appliedCount = activeFilterCount(filters);

  return (
    <Box data-testid="jobs-workspace" sx={{ px: { xs: 1.5, md: 2.5 }, py: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={650} letterSpacing="-0.02em">Solicitudes de empleo</Typography>
          <Typography variant="body2" color="text.secondary">
            Lo más reciente arriba.
          </Typography>
        </Box>
        <Button
          size="small"
          color="inherit"
          onClick={() => mutations.backfill.mutate({ dryRun: false, limit: 80 })}
        >
          Importar lote
        </Button>
      </Stack>

      <Stack
        direction="row"
        spacing={0.75}
        data-testid="jobs-pipeline"
        sx={{
          mb: 1.5,
          p: 0.75,
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Button
          size="small"
          color="inherit"
          variant={!stage && !stageGroup ? 'contained' : 'text'}
          onClick={() => selectStage('')}
          data-testid="jobs-stage-all"
          sx={{ flex: '0 0 auto', borderRadius: 1.5, textTransform: 'none' }}
        >
          Todas {metrics.data?.total ?? 0}
        </Button>
        {JOB_APPLICATION_STAGES.map((value) => (
          <Button
            key={value}
            size="small"
            color="inherit"
            variant={stageSelected(value) ? 'contained' : 'text'}
            onClick={() => selectStage(value)}
            data-testid={`jobs-stage-${value}`}
            sx={{ flex: '0 0 auto', borderRadius: 1.5, textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            {JOB_STAGE_LABELS[value]}
            <Box component="span" sx={{ ml: 0.75, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
              {byStage[value] ?? 0}
            </Box>
          </Button>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Buscar nombre o teléfono"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          sx={{ width: { xs: '100%', sm: 280 } }}
        />
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          disabled={items.length === 0 || mutations.refreshPage.isPending}
          onClick={() => mutations.refreshPage.mutate(items.map((row) => row.id))}
        >
          {mutations.refreshPage.isPending ? 'Actualizando…' : 'Actualizar página'}
        </Button>
        <Button
          size="small"
          variant={filtersOpen || appliedCount > 0 ? 'contained' : 'outlined'}
          color={appliedCount > 0 ? 'primary' : 'inherit'}
          onClick={() => {
            if (filtersOpen) {
              setFiltersOpen(false);
              return;
            }
            setDraft(filters);
            setFiltersOpen(true);
          }}
        >
          Filtros{appliedCount > 0 ? ` · ${appliedCount}` : ''}
        </Button>
      </Stack>
      {filtersOpen ? (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
            {([
              ['priorityOnly', 'Prioritarias'],
              ['needsStageReview', 'Por clasificar'],
              ['needsReview', 'Revisión'],
              ['includeMarian', 'Marian'],
            ] as const).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                clickable
                color={draft[key] ? 'primary' : 'default'}
                variant={draft[key] ? 'filled' : 'outlined'}
                onClick={() => setDraft((current) => ({ ...current, [key]: !current[key] }))}
              />
            ))}
            {([
              ['sent', 'Con hoja de vida'],
              ['missing', 'Sin hoja de vida'],
            ] as const).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                clickable
                color={draft.cv === value ? 'primary' : 'default'}
                variant={draft.cv === value ? 'filled' : 'outlined'}
                onClick={() => setDraft((current) => ({ ...current, cv: current.cv === value ? '' : value }))}
              />
            ))}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField
              size="small"
              type="date"
              label="Contactó desde"
              value={draft.contactedFrom}
              onChange={(event) => setDraft((current) => ({ ...current, contactedFrom: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              type="date"
              label="Contactó hasta"
              value={draft.contactedTo}
              onChange={(event) => setDraft((current) => ({ ...current, contactedTo: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                setFilters(EMPTY_FILTERS);
                setOffset(0);
                setFiltersOpen(false);
              }}
            >
              Limpiar
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                setFilters(draft);
                setOffset(0);
                setFiltersOpen(false);
              }}
            >
              Aplicar
            </Button>
          </Stack>
        </Box>
      ) : null}

      <JobApplicationTable
        items={items}
        onOpen={openDetail}
        onChat={openChat}
        onTransition={async (id, change) => {
          await mutations.transition.mutateAsync({
            id,
            stage: change.stage,
            note: change.note,
            interviewAt: change.interviewAt,
          });
        }}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          Anterior
        </Button>
        <Typography variant="body2" sx={{ alignSelf: 'center' }}>
          {total === 0 ? '0' : `${offset + 1}–${Math.min(offset + limit, total)}`} de {total}
        </Typography>
        <Button
          disabled={offset + limit >= total}
          onClick={() => setOffset(offset + limit)}
        >
          Siguiente
        </Button>
      </Stack>

      <Drawer
        anchor="right"
        open={Boolean(selectedId)}
        onClose={() => openDetail(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: 480 } } }}
      >
        {selectedId ? (
          <JobApplicationDetailPanel
            applicationId={selectedId}
            onClose={() => openDetail(null)}
          />
        ) : null}
      </Drawer>
    </Box>
  );
};

export default JobApplicationsPage;
