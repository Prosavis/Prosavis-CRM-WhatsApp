import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import {
  listBroadcastJobs,
  listBroadcastRecipients,
  type BroadcastJobSummary,
  type BroadcastRecipientDetail,
  type BroadcastRecipientStatus,
} from '@/services/whatsappService';

const RECIPIENT_STATUS_LABEL: Record<BroadcastRecipientStatus, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Fallido',
  skipped: 'Omitido',
};

const RECIPIENT_STATUS_COLOR: Record<
  BroadcastRecipientStatus,
  'default' | 'success' | 'error' | 'warning'
> = {
  pending: 'warning',
  sent: 'success',
  failed: 'error',
  skipped: 'default',
};

const JOB_STATUS_LABEL: Record<string, string> = {
  processing: 'En curso',
  completed: 'Completado',
};

const RECIPIENTS_PAGE_SIZE = 25;

export interface BroadcastJobsSectionProps {
  days: number;
  /** Si viene de un envío recién terminado, abre el detalle de ese job. */
  initialJobId?: string | null;
  onInitialJobConsumed?: () => void;
}

const BroadcastJobsSection: React.FC<BroadcastJobsSectionProps> = ({
  days,
  initialJobId,
  onInitialJobConsumed,
}) => {
  const [jobs, setJobs] = useState<BroadcastJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailJob, setDetailJob] = useState<BroadcastJobSummary | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipientDetail[]>([]);
  const [recipientsTotal, setRecipientsTotal] = useState(0);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<BroadcastRecipientStatus | 'all'>('all');
  const [recipientPage, setRecipientPage] = useState(0);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBroadcastJobs({ days, limit: 50 });
      setJobs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando envíos masivos');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const openJobDetail = useCallback(async (job: BroadcastJobSummary) => {
    setDetailJob(job);
    setRecipientStatusFilter('all');
    setRecipientPage(0);
  }, []);

  const loadRecipients = useCallback(async () => {
    if (!detailJob) return;
    setRecipientsLoading(true);
    try {
      const { recipients: rows, total } = await listBroadcastRecipients(detailJob.id, {
        status: recipientStatusFilter,
        limit: RECIPIENTS_PAGE_SIZE,
        offset: recipientPage * RECIPIENTS_PAGE_SIZE,
      });
      setRecipients(rows);
      setRecipientsTotal(total);
    } catch (e) {
      setRecipients([]);
      setRecipientsTotal(0);
      setError(e instanceof Error ? e.message : 'Error cargando destinatarios');
    } finally {
      setRecipientsLoading(false);
    }
  }, [detailJob, recipientStatusFilter, recipientPage]);

  useEffect(() => {
    if (detailJob) void loadRecipients();
  }, [detailJob, loadRecipients]);

  useEffect(() => {
    if (!initialJobId || loading || jobs.length === 0) return;
    const job = jobs.find((j) => j.id === initialJobId);
    if (job) {
      void openJobDetail(job);
      onInitialJobConsumed?.();
    }
  }, [initialJobId, loading, jobs, openJobDetail, onInitialJobConsumed]);

  const closeDetail = () => {
    setDetailJob(null);
    setRecipients([]);
    setRecipientsTotal(0);
    setRecipientPage(0);
  };

  const jobPreview = (job: BroadcastJobSummary) =>
    job.templateName
      ? `Plantilla: ${job.templateName}`
      : job.richBodyPreview
        ? job.richBodyPreview.slice(0, 80) + (job.richBodyPreview.length > 80 ? '…' : '')
        : '—';

  const recipientTotalPages = Math.max(1, Math.ceil(recipientsTotal / RECIPIENTS_PAGE_SIZE));

  return (
    <>
      <Card
        elevation={0}
        sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
        data-tour="whatsapp-metrics-broadcasts"
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <CampaignIcon color="secondary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={600}>
              Envíos masivos (panel)
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              Últimos {days} días · detalle por destinatario
            </Typography>
          </Box>

          {error && !detailJob && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : jobs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No hay envíos masivos en este periodo.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Mensaje</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Enviados</TableCell>
                    <TableCell align="right">Fallidos</TableCell>
                    <TableCell align="right">Omitidos</TableCell>
                    <TableCell align="right">Pendientes</TableCell>
                    <TableCell align="center">Detalle</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {job.createdAt.toLocaleString('es-CO', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={JOB_STATUS_LABEL[job.status] ?? job.status}
                          color={job.status === 'completed' ? 'success' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Tooltip title={jobPreview(job)}>
                          <span>{jobPreview(job)}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">{job.totalRecipients}</TableCell>
                      <TableCell align="right">{job.sent}</TableCell>
                      <TableCell align="right">
                        <Typography
                          component="span"
                          color={job.failed > 0 ? 'error.main' : 'text.primary'}
                          fontWeight={job.failed > 0 ? 600 : 400}
                        >
                          {job.failed}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{job.skipped}</TableCell>
                      <TableCell align="right">
                        {job.pending > 0 ? (
                          <Chip size="small" label={job.pending} color="warning" />
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          aria-label="Ver destinatarios"
                          onClick={() => void openJobDetail(job)}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailJob} onClose={closeDetail} maxWidth="md" fullWidth scroll="paper">
        {detailJob && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pr: 6 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" fontWeight={700}>
                  Destinatarios del envío masivo
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {detailJob.createdAt.toLocaleString('es-CO')} · {jobPreview(detailJob)}
                </Typography>
                <StackChips job={detailJob} />
              </Box>
              <IconButton
                onClick={closeDetail}
                size="small"
                sx={{ position: 'absolute', right: 12, top: 12 }}
                aria-label="Cerrar"
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Estado</InputLabel>
                  <Select
                    value={recipientStatusFilter}
                    label="Estado"
                    onChange={(e) => {
                      setRecipientStatusFilter(e.target.value as BroadcastRecipientStatus | 'all');
                      setRecipientPage(0);
                    }}
                  >
                    <MenuItem value="all">Todos</MenuItem>
                    <MenuItem value="sent">Enviados</MenuItem>
                    <MenuItem value="failed">Fallidos</MenuItem>
                    <MenuItem value="skipped">Omitidos</MenuItem>
                    <MenuItem value="pending">Pendientes</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                  {recipientsTotal} destinatario{recipientsTotal !== 1 ? 's' : ''}
                </Typography>
              </Box>

              {recipientsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Contacto</TableCell>
                        <TableCell>Teléfono</TableCell>
                        <TableCell>Estado</TableCell>
                        <TableCell align="right">Intentos</TableCell>
                        <TableCell>WA Message ID</TableCell>
                        <TableCell>Error / motivo</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recipients.map((r) => (
                        <TableRow key={r.id} hover>
                          <TableCell>{r.name || '—'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{r.phone}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={RECIPIENT_STATUS_LABEL[r.status] ?? r.status}
                              color={RECIPIENT_STATUS_COLOR[r.status] ?? 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">{r.attempts}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.waMessageId || '—'}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <Tooltip title={r.errorMessage || ''}>
                              <span>{r.errorMessage || '—'}</span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                      {recipients.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                            <Typography color="text.secondary">Sin destinatarios en este filtro</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {recipientTotalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mt: 2 }}>
                  <Button
                    size="small"
                    disabled={recipientPage === 0}
                    onClick={() => setRecipientPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Página {recipientPage + 1} de {recipientTotalPages}
                  </Typography>
                  <Button
                    size="small"
                    disabled={recipientPage >= recipientTotalPages - 1}
                    onClick={() => setRecipientPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </Box>
              )}

              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                Los envíos exitosos también aparecen en el registro de mensajes abajo (campaña BULK_PANEL).
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeDetail}>Cerrar</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
};

function StackChips({ job }: { job: BroadcastJobSummary }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
      <Chip size="small" label={`Enviados: ${job.sent}`} color="success" variant="outlined" />
      <Chip size="small" label={`Fallidos: ${job.failed}`} color={job.failed > 0 ? 'error' : 'default'} variant="outlined" />
      <Chip size="small" label={`Omitidos: ${job.skipped}`} variant="outlined" />
      {job.pending > 0 && (
        <Chip size="small" label={`Pendientes: ${job.pending}`} color="warning" variant="outlined" />
      )}
    </Box>
  );
}

export default BroadcastJobsSection;
