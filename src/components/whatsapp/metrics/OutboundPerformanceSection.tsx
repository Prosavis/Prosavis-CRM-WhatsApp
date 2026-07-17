import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Send as SendIcon,
  MarkEmailRead as ReadIcon,
  Error as ErrorIcon,
  Reply as ReplyIcon,
  Block as BlockIcon,
  Search as SearchIcon,
  FilterAltOff as FilterAltOffIcon,
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import type { OutboundMetricsBucket, WhatsAppMetrics } from '@/types/whatsapp';
import { getMetricAccent } from '@/utils/coloredChipStyles';
import BroadcastJobsSection from './BroadcastJobsSection';
import MetricsSection from './MetricsSection';
import { downloadCsv } from './utils/exportMetricsCsv';

export interface MessageLogRow {
  id: string;
  phoneNumberId?: string;
  recipientPhone?: string;
  recipientBsuid?: string;
  templateName?: string;
  messageBody?: string;
  status: string;
  direction?: string;
  intent?: string;
  createdAt: Date;
  waMessageId?: string;
  errorMessage?: string;
  campaignType?: string;
}

interface OutboundPerformanceSectionProps {
  metrics: WhatsAppMetrics | null;
  metricsLoading: boolean;
  days: number;
  logs: MessageLogRow[];
  logsLoading: boolean;
  logsFetchWarning: string | null;
  onClearLogsWarning: () => void;
  broadcastJobParam?: string | null;
  onInitialJobConsumed?: () => void;
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'error',
  received: 'warning',
};

const KPI_CARDS = [
  { key: 'totalSent' as const, label: 'Enviados (sin fallos)', icon: <SendIcon />, color: '#1976d2', bgLight: '#e3f2fd' },
  { key: 'reachedDevice' as const, label: 'En el dispositivo (entreg. + leídos)', icon: <DoneAllIcon />, color: '#2e7d32', bgLight: '#e8f5e9' },
  { key: 'totalRead' as const, label: 'Leídos', icon: <ReadIcon />, color: '#00897b', bgLight: '#e0f2f1' },
  { key: 'totalFailed' as const, label: 'Fallidos', icon: <ErrorIcon />, color: '#d32f2f', bgLight: '#ffebee' },
  { key: 'totalResponses' as const, label: 'Respuestas', icon: <ReplyIcon />, color: '#ed6c02', bgLight: '#fff3e0' },
  { key: 'optOutCount' as const, label: 'Opt-out', icon: <BlockIcon />, color: '#78909c', bgLight: '#eceff1' },
];

const ROWS_PER_PAGE = 15;

function outboundOk(data: OutboundMetricsBucket): number {
  return data.outboundOk ?? data.sent + data.delivered + data.read;
}

const OutboundPerformanceSection: React.FC<OutboundPerformanceSectionProps> = ({
  metrics,
  metricsLoading,
  days,
  logs,
  logsLoading,
  logsFetchWarning,
  onClearLogsWarning,
  broadcastJobParam,
  onInitialJobConsumed,
}) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        !searchTerm ||
        log.recipientPhone?.includes(searchTerm) ||
        log.templateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.messageBody?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || log.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [logs, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredLogs.length / ROWS_PER_PAGE);
  const paginatedLogs = filteredLogs.slice(
    page * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE + ROWS_PER_PAGE,
  );

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPage(0);
  };

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all';

  type PageNumberItem = number | 'start-ellipsis' | 'end-ellipsis';

  const getPageNumbers = (): PageNumberItem[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages: PageNumberItem[] = [];
    if (page <= 3) {
      for (let i = 0; i < 5; i++) pages.push(i);
      pages.push('end-ellipsis', totalPages - 1);
    } else if (page >= totalPages - 4) {
      pages.push(0, 'start-ellipsis');
      for (let i = totalPages - 5; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0, 'start-ellipsis');
      for (let i = page - 1; i <= page + 1; i++) pages.push(i);
      pages.push('end-ellipsis', totalPages - 1);
    }
    return pages;
  };

  const handleDownloadTables = () => {
    const campaignRows = Object.entries(metrics?.byCampaign ?? {}).map(([name, data]) => [
      name,
      outboundOk(data),
      data.delivered,
      data.read,
      data.failed,
    ]);
    downloadCsv(
      'outbound-por-campana.csv',
      ['campana', 'enviados_ok', 'entregados', 'leidos', 'fallidos'],
      campaignRows,
    );
  };

  return (
    <Box>
      <MetricsSection
        title="Rendimiento outbound"
        subtitle="Envíos WhatsApp, tasa de respuesta y desglose por campaña / plantilla."
        onDownload={handleDownloadTables}
        downloadLabel="Descargar campañas CSV"
        defaultExpanded
        detail={
          <Stack spacing={2}>
            {metrics && Object.keys(metrics.byCampaign).length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Por campaña
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Campaña</TableCell>
                        <TableCell align="right">Enviados (sin fallos)</TableCell>
                        <TableCell align="right">Entregados</TableCell>
                        <TableCell align="right">Leídos</TableCell>
                        <TableCell align="right">Fallidos</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.byCampaign).map(([name, data]) => (
                        <TableRow key={name} hover>
                          <TableCell>{name}</TableCell>
                          <TableCell align="right">{outboundOk(data)}</TableCell>
                          <TableCell align="right">{data.delivered}</TableCell>
                          <TableCell align="right">{data.read}</TableCell>
                          <TableCell align="right">{data.failed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {metrics?.byKind && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Por tipo de mensaje
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tipo</TableCell>
                        <TableCell align="right">Enviados (sin fallos)</TableCell>
                        <TableCell align="right">Entregados</TableCell>
                        <TableCell align="right">Leídos</TableCell>
                        <TableCell align="right">Fallidos</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {([
                        ['Sesión 24h', metrics.byKind.session],
                        ['Plantilla / campaña', metrics.byKind.template],
                      ] as const).map(([label, data]) => (
                        <TableRow key={label} hover>
                          <TableCell>
                            <Chip
                              size="small"
                              label={label}
                              color={label.startsWith('Sesión') ? 'info' : 'secondary'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">{data.outboundOk}</TableCell>
                          <TableCell align="right">{data.delivered}</TableCell>
                          <TableCell align="right">{data.read}</TableCell>
                          <TableCell align="right">{data.failed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {metrics?.byTemplate && Object.keys(metrics.byTemplate).length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Por plantilla (Meta)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Plantilla</TableCell>
                        <TableCell align="right">Enviados (sin fallos)</TableCell>
                        <TableCell align="right">Entregados</TableCell>
                        <TableCell align="right">Leídos</TableCell>
                        <TableCell align="right">Fallidos</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.byTemplate).map(([name, data]) => (
                        <TableRow key={name} hover>
                          <TableCell>
                            <Chip size="small" label={name} variant="outlined" color="secondary" />
                          </TableCell>
                          <TableCell align="right">{data.outboundOk}</TableCell>
                          <TableCell align="right">{data.delivered}</TableCell>
                          <TableCell align="right">{data.read}</TableCell>
                          <TableCell align="right">{data.failed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Stack>
        }
      >
        <Grid container spacing={2} sx={{ mb: 2 }} data-tour="whatsapp-metrics-kpis">
          {KPI_CARDS.map(({ key, label, icon, color, bgLight }) => {
            const accent = getMetricAccent(theme, color, bgLight);
            return (
              <Grid item xs={6} sm={4} md={2} key={key}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                  }}
                >
                  <CardContent sx={{ textAlign: 'center', py: 2.5, px: 1.5 }}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        bgcolor: accent.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 1,
                        color: accent.color,
                      }}
                    >
                      {React.cloneElement(icon, { sx: { fontSize: 22 } })}
                    </Box>
                    {metricsLoading ? (
                      <CircularProgress size={22} sx={{ my: 0.5 }} />
                    ) : (
                      <Typography variant="h4" fontWeight={800} sx={{ color: accent.color, lineHeight: 1.2 }}>
                        {(metrics?.[key] as number ?? 0).toLocaleString('es-CO')}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mt: 0.5 }}>
                      {label}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {metrics && (
          <Grid container spacing={2} data-tour="whatsapp-metrics-funnel">
            <Grid item xs={12} md={4}>
              <Tooltip
                title="Contactos únicos que respondieron tras un envío ÷ contactos únicos contactados."
                placement="top"
                arrow
              >
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%', cursor: 'help' }}>
                  <CardContent sx={{ textAlign: 'center', py: 3 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                      Tasa de respuesta
                    </Typography>
                    <Typography variant="h3" fontWeight={800} color="primary">
                      {Math.min(100, metrics.responseRate)}%
                    </Typography>
                  </CardContent>
                </Card>
              </Tooltip>
            </Grid>
            <Grid item xs={12} md={8}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                    Embudo directorio (secuencias / pendientes)
                  </Typography>
                  <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                    <Chip label={`Total: ${metrics.leads.total}`} variant="outlined" />
                    <Chip label={`Seguimiento: ${metrics.leads.enSeguimiento}`} color="info" />
                    <Chip label={`Rebooking: ${metrics.leads.enRebooking}`} color="warning" />
                    <Chip
                      label={`Con cita pendiente: ${metrics.leads.agendados}`}
                      color="success"
                    />
                    <Chip label={`Opt-out: ${metrics.leads.optOut}`} color="error" />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </MetricsSection>

      <BroadcastJobsSection
        days={days}
        initialJobId={broadcastJobParam}
        onInitialJobConsumed={onInitialJobConsumed}
      />

      <Card
        data-tour="whatsapp-metrics-logs"
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
      >
        <CardContent>
          {logsFetchWarning && (
            <Alert severity="warning" sx={{ mb: 2 }} onClose={onClearLogsWarning}>
              {logsFetchWarning}
            </Alert>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mr: 'auto' }}>
              Registro de mensajes
            </Typography>
            <TextField
              size="small"
              placeholder="Buscar por teléfono, template..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 250 }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Estado</InputLabel>
              <Select
                value={statusFilter}
                label="Estado"
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="sent">Enviado</MenuItem>
                <MenuItem value="delivered">Entregado</MenuItem>
                <MenuItem value="read">Leído</MenuItem>
                <MenuItem value="failed">Fallido</MenuItem>
                <MenuItem value="received">Recibido</MenuItem>
              </Select>
            </FormControl>
            {hasActiveFilters && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<FilterAltOffIcon />}
                onClick={clearFilters}
              >
                Limpiar filtros
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                downloadCsv(
                  'registro-mensajes.csv',
                  ['fecha', 'destinatario', 'plantilla', 'estado', 'direccion', 'campana', 'error'],
                  filteredLogs.map((log) => [
                    log.createdAt.toISOString(),
                    log.recipientPhone || log.recipientBsuid || '',
                    log.templateName || '',
                    log.status,
                    log.direction || '',
                    log.campaignType || '',
                    log.errorMessage || '',
                  ]),
                );
              }}
            >
              CSV
            </Button>
          </Box>

          {logsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow
                      sx={{
                        bgcolor: (t) =>
                          t.palette.mode === 'dark' ? 'action.hover' : 'grey.50',
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Destinatario</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Plantilla</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Estado</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Dirección</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Campaña</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Error</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedLogs.map((log) => (
                      <TableRow key={log.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {log.createdAt.toLocaleString('es-CO', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                          {log.recipientPhone || log.recipientBsuid || '—'}
                        </TableCell>
                        <TableCell>{log.templateName || '—'}</TableCell>
                        <TableCell>
                          {log.direction === 'inbound' ? (
                            '—'
                          ) : log.templateName ? (
                            <Chip label="Plantilla" size="small" variant="outlined" color="secondary" />
                          ) : (
                            <Chip label="Sesión 24h" size="small" variant="outlined" color="info" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={log.status}
                            size="small"
                            color={STATUS_COLORS[log.status] || 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          {log.direction === 'inbound' ? (
                            <Chip label="Entrante" size="small" variant="outlined" color="warning" />
                          ) : (
                            <Chip label="Saliente" size="small" variant="outlined" color="info" />
                          )}
                        </TableCell>
                        <TableCell>{log.campaignType || '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.errorMessage || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {paginatedLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">
                            No se encontraron mensajes
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {totalPages > 1 && (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 0.5,
                    mt: 3,
                    mb: 1,
                  }}
                >
                  <IconButton
                    size="small"
                    disabled={page === 0}
                    onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                    sx={{ color: 'primary.main' }}
                  >
                    <NavigateBeforeIcon />
                  </IconButton>

                  {getPageNumbers().map((p) =>
                    typeof p === 'string' ? (
                      <Typography
                        key={p}
                        sx={{ px: 1, color: 'text.secondary', userSelect: 'none' }}
                      >
                        …
                      </Typography>
                    ) : (
                      <Button
                        key={p}
                        size="small"
                        variant={p === page ? 'contained' : 'text'}
                        onClick={() => setPage(p)}
                        sx={{
                          minWidth: 36,
                          height: 36,
                          borderRadius: '50%',
                          fontWeight: p === page ? 700 : 400,
                          ...(p !== page && { color: 'primary.main' }),
                        }}
                      >
                        {p + 1}
                      </Button>
                    ),
                  )}

                  <IconButton
                    size="small"
                    disabled={page >= totalPages - 1}
                    onClick={() =>
                      setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1))
                    }
                    sx={{ color: 'primary.main' }}
                  >
                    <NavigateNextIcon />
                  </IconButton>
                </Box>
              )}

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', textAlign: 'center' }}
              >
                {filteredLogs.length} registros · Página {page + 1} de {totalPages || 1}
              </Typography>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default OutboundPerformanceSection;
