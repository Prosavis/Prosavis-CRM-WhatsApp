import React, { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import { usePostServiceHistory } from '@/hooks/usePostServiceHistory';
import {
  POST_SERVICE_OUTCOME_COLOR,
  POST_SERVICE_OUTCOME_LABEL,
  type PostServiceAutomationEvent,
  type PostServiceAutomationRun,
} from '@/types/postServiceAutomations';

type RangeDays = 7 | 14 | 30;

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(days: RangeDays): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return {
    dateFrom: toLocalIsoDate(from),
    dateTo: toLocalIsoDate(to),
  };
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function formatRunKind(kind: string): string {
  switch (kind) {
    case 'primary':
      return 'Ejecución programada';
    case 'retry':
      return 'Reintento';
    case 'manual':
      return 'Ejecución manual';
    case 'dry_run':
      return 'Simulación';
    default:
      return kind;
  }
}

const PostServiceHistoryPanel: React.FC = () => {
  const [rangeDays, setRangeDays] = useState<RangeDays>(7);
  const range = useMemo(() => getDateRange(rangeDays), [rangeDays]);
  const { data, isLoading, isFetching, error, refetch } = usePostServiceHistory(range);
  const runs = data?.runs ?? [];
  const eventCount = runs.reduce(
    (total, run) => total + (data?.eventsByRun[run.id]?.length ?? 0),
    0,
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ md: 'center' }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <HistoryIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>
                  Historial post-servicio
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Corridas y eventos del monitor de seguimiento posterior a la cita.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={rangeDays}
                onChange={(_, value: RangeDays | null) => {
                  if (value) setRangeDays(value);
                }}
                aria-label="Rango del historial post-servicio"
              >
                <ToggleButton value={7} sx={{ textTransform: 'none' }}>
                  7 días
                </ToggleButton>
                <ToggleButton value={14} sx={{ textTransform: 'none' }}>
                  14 días
                </ToggleButton>
                <ToggleButton value={30} sx={{ textTransform: 'none' }}>
                  30 días
                </ToggleButton>
              </ToggleButtonGroup>
              <Button
                size="small"
                variant="outlined"
                startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshIcon />}
                disabled={isFetching}
                onClick={() => void refetch()}
                sx={{ textTransform: 'none' }}
              >
                Actualizar
              </Button>
            </Stack>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {range.dateFrom} a {range.dateTo}
            {runs.length > 0 ? ` · ${runs.length} corridas · ${eventCount} eventos` : ''}
          </Typography>
        </CardContent>
      </Card>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Reintentar
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      {isLoading ? (
        <Box
          role="status"
          aria-label="Cargando historial post-servicio"
          sx={{ display: 'flex', justifyContent: 'center', py: 7 }}
        >
          <CircularProgress />
        </Box>
      ) : runs.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" fontWeight={600}>
              No hay corridas en los últimos {rangeDays} días
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Elige un rango mayor o actualiza para consultar de nuevo.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.25}>
          {runs.map((run) => (
            <RunAccordion
              key={run.id}
              run={run}
              events={data?.eventsByRun[run.id] ?? []}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

function RunAccordion({
  run,
  events,
}: {
  run: PostServiceAutomationRun;
  events: PostServiceAutomationEvent[];
}) {
  const stats = run.execution_stats;

  return (
    <Accordion
      variant="outlined"
      disableGutters
      sx={{ borderRadius: 2, '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 0.75, sm: 2 }}
          alignItems={{ sm: 'center' }}
          sx={{ width: '100%', pr: 1 }}
        >
          <Box sx={{ minWidth: 180 }}>
            <Typography variant="body2" fontWeight={700}>
              {formatRunKind(run.run_kind)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDateTime(run.run_at || run.created_at)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${stats.sent ?? 0} enviados`}
            />
            <Chip
              size="small"
              color="error"
              variant="outlined"
              label={`${stats.failed ?? 0} fallidos`}
            />
            {(stats.dryRun ?? 0) > 0 && (
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label={`${stats.dryRun} simulados`}
              />
            )}
            {(stats.skipped ?? 0) > 0 && (
              <Chip
                size="small"
                variant="outlined"
                label={`${stats.skipped} omitidos`}
              />
            )}
            <Chip size="small" variant="outlined" label={`${events.length} eventos`} />
            {run.dry_run && <Chip size="small" color="info" label="dry-run" />}
          </Stack>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Esta corrida no tiene eventos registrados.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" aria-label={`Eventos de la corrida ${run.id}`}>
              <TableHead>
                <TableRow>
                  <TableCell>Estado</TableCell>
                  <TableCell>Cita</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Servicio</TableCell>
                  <TableCell>Error</TableCell>
                  <TableCell>Registrado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id} hover>
                    <TableCell>
                      <Chip
                        size="small"
                        label={POST_SERVICE_OUTCOME_LABEL[event.outcome] ?? event.outcome}
                        color={POST_SERVICE_OUTCOME_COLOR[event.outcome] ?? 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {event.appointment_id?.slice(0, 10) ?? '—'}
                    </TableCell>
                    <TableCell>{event.recipient_name || '—'}</TableCell>
                    <TableCell>{event.service_date || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography
                        variant="body2"
                        color={event.error_message ? 'error' : 'text.secondary'}
                        noWrap
                        title={event.error_message ?? undefined}
                      >
                        {event.error_message || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDateTime(event.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default PostServiceHistoryPanel;
