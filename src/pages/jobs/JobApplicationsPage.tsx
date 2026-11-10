import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Drawer,
  FormControlLabel,
  Stack,
  Switch,
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

  return (
    <Box data-testid="jobs-workspace" sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.5, md: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>Solicitudes de empleo</Typography>
        <Button
          size="small"
          onClick={() => mutations.backfill.mutate({ dryRun: false, limit: 80 })}
        >
          Importar lote
        </Button>
      </Stack>

      <JobApplicationsKpis
        metrics={metrics.data}
        loading={metrics.isPending}
        error={metrics.error instanceof Error ? metrics.error.message : null}
        onSelect={selectKpi}
      />

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        data-testid="jobs-pipeline"
        sx={{ mb: 2 }}
      >
        <Button
          size="small"
          variant={!stage && !stageGroup ? 'contained' : 'outlined'}
          onClick={() => selectStage('')}
          data-testid="jobs-stage-all"
        >
          Todas {metrics.data?.total ?? 0}
        </Button>
        {JOB_APPLICATION_STAGES.map((value) => (
          <Button
            key={value}
            size="small"
            variant={stageSelected(value) ? 'contained' : 'outlined'}
            onClick={() => selectStage(value)}
            data-testid={`jobs-stage-${value}`}
          >
            {JOB_STAGE_LABELS[value]} {byStage[value] ?? 0}
          </Button>
        ))}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Buscar"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={priorityOnly}
              onChange={(event) => {
                setPriorityOnly(event.target.checked);
                setOffset(0);
              }}
            />
          }
          label="Solo prioritarias"
        />
        <FormControlLabel
          control={
            <Switch
              checked={needsStageReview}
              onChange={(event) => {
                setNeedsStageReview(event.target.checked);
                setOffset(0);
              }}
            />
          }
          label="Por clasificar"
        />
        <FormControlLabel
          control={
            <Switch
              checked={needsReview}
              onChange={(event) => {
                setNeedsReview(event.target.checked);
                setOffset(0);
              }}
            />
          }
          label="Solo revisión"
        />
        <FormControlLabel
          control={
            <Switch
              checked={includeMarian}
              onChange={(event) => {
                setIncludeMarian(event.target.checked);
                setOffset(0);
              }}
            />
          }
          label="Incluir Marian"
        />
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
