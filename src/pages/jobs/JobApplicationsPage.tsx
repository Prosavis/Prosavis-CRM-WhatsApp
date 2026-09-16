import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Drawer,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { JobApplicationDetailPanel } from '@/components/jobs/JobApplicationDetail';
import { JobApplicationTable } from '@/components/jobs/JobApplicationTable';
import { JobApplicationsKpis } from '@/components/jobs/JobApplicationsKpis';
import {
  useJobApplicationMutations,
  useJobApplicationsList,
  useJobApplicationsMetrics,
} from '@/hooks/useJobApplicationsQueries';
import { JOB_APPLICATION_STAGES, JOB_STAGE_LABELS } from '@/utils/jobApplicationsDomain';

const JobApplicationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('applicationId');
  const [tab, setTab] = useState(0);
  const [stage, setStage] = useState<string>('');
  const [search, setSearch] = useState('');
  const [includeMarian, setIncludeMarian] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const metrics = useJobApplicationsMetrics(includeMarian);
  const list = useJobApplicationsList({
    stage: stage || null,
    search,
    includeMarian,
    needsReview: needsReview || tab === 2,
    limit,
    offset,
  });
  const mutations = useJobApplicationMutations();

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const analyticsRows = useMemo(
    () => Object.entries(metrics.data?.byStage ?? {}),
    [metrics.data],
  );

  const openDetail = (id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('applicationId', id);
      else next.delete('applicationId');
      return next;
    }, { replace: true });
  };

  return (
    <Box data-testid="jobs-workspace" sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.5, md: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>Solicitudes de empleo</Typography>
        <Button
          variant="outlined"
          onClick={() => mutations.backfill.mutate({ dryRun: false, limit: 80 })}
        >
          Importar lote
        </Button>
      </Stack>

      <JobApplicationsKpis
        metrics={metrics.data}
        loading={metrics.isPending}
        error={metrics.error instanceof Error ? metrics.error.message : null}
        onSelect={(key) => {
          setNeedsReview(key === 'needsReview');
          setIncludeMarian(key === 'marianSpecial');
          setStage(key === 'hired' ? 'hired' : key === 'rejectedOrWithdrawn' ? 'rejected' : '');
          setTab(0);
        }}
      />

      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="Solicitudes" data-testid="jobs-tab-list" />
        <Tab label="Analítica" data-testid="jobs-tab-analytics" />
        <Tab label="Revisión IA" data-testid="jobs-tab-review" />
      </Tabs>

      {tab === 0 || tab === 2 ? (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Buscar"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
            <TextField
              select
              size="small"
              label="Etapa"
              value={stage}
              onChange={(event) => {
                setStage(event.target.value);
                setOffset(0);
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Todas</MenuItem>
              {JOB_APPLICATION_STAGES.map((value) => (
                <MenuItem key={value} value={value}>
                  {JOB_STAGE_LABELS[value]}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={includeMarian}
                  onChange={(event) => setIncludeMarian(event.target.checked)}
                />
              }
              label="Incluir Marian"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={needsReview || tab === 2}
                  onChange={(event) => setNeedsReview(event.target.checked)}
                />
              }
              label="Solo revisión"
            />
          </Stack>
          <JobApplicationTable
            items={items}
            onOpen={openDetail}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              Anterior
            </Button>
            <Typography variant="body2" sx={{ alignSelf: 'center' }}>
              {offset + 1}–{Math.min(offset + limit, total)} de {total}
            </Typography>
            <Button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Siguiente
            </Button>
          </Stack>
        </>
      ) : (
        <Box data-testid="jobs-analytics">
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Embudo Job</Typography>
          {analyticsRows.map(([stageKey, count]) => (
            <Typography key={stageKey} variant="body2">
              {JOB_STAGE_LABELS[stageKey as keyof typeof JOB_STAGE_LABELS] ?? stageKey}: {count}
            </Typography>
          ))}
          <Typography variant="body2" sx={{ mt: 2 }}>
            Fuentes: {JSON.stringify(metrics.data?.bySourceChannel ?? {})}
          </Typography>
        </Box>
      )}

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
