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
import { JobApplicationsKpis, type JobKpiKey } from '@/components/jobs/JobApplicationsKpis';
import {
  useJobApplicationMutations,
  useJobApplicationsList,
  useJobApplicationsMetrics,
} from '@/hooks/useJobApplicationsQueries';
import { JOB_APPLICATION_STAGES, JOB_STAGE_LABELS, type JobApplicationStage } from '@/utils/jobApplicationsDomain';

const INTERVIEW_STAGES = ['interview_pending', 'interview_scheduled'];
const CLOSURE_STAGES = ['rejected', 'interview_declined', 'no_show', 'despedida'];

const JobApplicationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('applicationId');
  const [stage, setStage] = useState<string>('inbound');
  const [stageGroup, setStageGroup] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const [includeMarian, setIncludeMarian] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [needsStageReview, setNeedsStageReview] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const metrics = useJobApplicationsMetrics(includeMarian);
  const list = useJobApplicationsList({
    stage: stageGroup ? null : stage || null,
    stages: stageGroup,
    search,
    includeMarian,
    needsReview,
    priorityOnly,
    needsStageReview,
    limit,
    offset,
  });
  const mutations = useJobApplicationMutations();

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const byStage = metrics.data?.byStage ?? {};

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

  const selectKpi = (key: JobKpiKey) => {
    setOffset(0);
    setNeedsReview(false);
    setNeedsStageReview(false);
    setPriorityOnly(false);
    setStageGroup(null);
    switch (key) {
      case 'inbound':
        setStage('inbound');
        return;
      case 'priority':
        setStage('inbound');
        setPriorityOnly(true);
        return;
      case 'interviewsOpen':
        setStage('');
        setStageGroup(INTERVIEW_STAGES);
        return;
      case 'hired':
        setStage('hired');
        return;
      case 'closures':
        setStage('');
        setStageGroup(CLOSURE_STAGES);
        return;
      case 'marianSpecial':
        setIncludeMarian(true);
        setStage('inbound');
        return;
      default: {
        const unreachable: never = key;
        return unreachable;
      }
    }
  };

  const stageSelected = (value: JobApplicationStage) =>
    stageGroup ? stageGroup.includes(value) : stage === value;

  const selectedKpi: JobKpiKey | null = priorityOnly && stage === 'inbound'
    ? 'priority'
    : stage === 'hired'
      ? 'hired'
      : stage === 'inbound'
        ? 'inbound'
        : stageGroup === INTERVIEW_STAGES
          ? 'interviewsOpen'
          : stageGroup === CLOSURE_STAGES
            ? 'closures'
            : null;

  const toggleFilter = (key: 'priorityOnly' | 'needsStageReview' | 'needsReview' | 'includeMarian') => {
    setOffset(0);
    if (key === 'priorityOnly') setPriorityOnly((value) => !value);
    if (key === 'needsStageReview') setNeedsStageReview((value) => !value);
    if (key === 'needsReview') setNeedsReview((value) => !value);
    if (key === 'includeMarian') setIncludeMarian((value) => !value);
  };

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

      <JobApplicationsKpis
        metrics={metrics.data}
        loading={metrics.isPending}
        error={metrics.error instanceof Error ? metrics.error.message : null}
        selected={selectedKpi}
        onSelect={selectKpi}
      />

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

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Buscar nombre o teléfono"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          sx={{ minWidth: 220, flex: '1 1 220px' }}
        />
        {([
          ['priorityOnly', 'Prioritarias', priorityOnly],
          ['needsStageReview', 'Por clasificar', needsStageReview],
          ['needsReview', 'Revisión', needsReview],
          ['includeMarian', 'Marian', includeMarian],
        ] as const).map(([key, label, on]) => (
          <Chip
            key={key}
            label={label}
            clickable
            color={on ? 'primary' : 'default'}
            variant={on ? 'filled' : 'outlined'}
            onClick={() => toggleFilter(key)}
          />
        ))}
      </Stack>

      <JobApplicationTable
        items={items}
        onOpen={openDetail}
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
