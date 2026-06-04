import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
  IconButton,
  Button,
  Alert,
  AlertTitle,
  Stack,
  Divider,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Storage as StorageIcon,
  PhotoLibrary as PhotoIcon,
  Videocam as VideoIcon,
  Mic as AudioIcon,
  Description as DocIcon,
  TextFields as TextIcon,
  Chat as ChatIcon,
  People as PeopleIcon,
  CalendarMonth as CalendarIcon,
  Block as BlockIcon,
  AdminPanelSettings as AdminIcon,
  Campaign as CampaignIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  DeleteSweep as DeleteSweepIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Speed as SpeedIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import {
  getMonitorDashboard,
  type MonitorDashboard,
  type StorageStats,
  type HeavyChat,
  type GeneralMetrics,
  type ConnectionStatus,
  type MediaBreakdown,
} from '@/services/monitorService';
import { supabase } from '@/config/supabase';

// ──────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────

const BREAKDOWN_CONFIG: Record<
  keyof MediaBreakdown,
  { label: string; icon: React.ReactNode; color: string; lightBg: string }
> = {
  image: { label: 'Fotos', icon: <PhotoIcon fontSize="small" />, color: '#1976d2', lightBg: '#e3f2fd' },
  video: { label: 'Videos', icon: <VideoIcon fontSize="small" />, color: '#2e7d32', lightBg: '#e8f5e9' },
  audio: { label: 'Audios', icon: <AudioIcon fontSize="small" />, color: '#ed6c02', lightBg: '#fff3e0' },
  document: { label: 'Documentos', icon: <DocIcon fontSize="small" />, color: '#9c27b0', lightBg: '#f3e5f5' },
  text: { label: 'Solo texto', icon: <TextIcon fontSize="small" />, color: '#757575', lightBg: '#f5f5f5' },
  other: { label: 'Otros', icon: <InfoIcon fontSize="small" />, color: '#78909c', lightBg: '#eceff1' },
} as const;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

// ──────────────────────────────────────────────
// SVG Donut Chart
// ──────────────────────────────────────────────

function DonutChart({ breakdown, totalBytes }: { breakdown: MediaBreakdown; totalBytes: number }) {
  const size = 180;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  const entries = (Object.keys(BREAKDOWN_CONFIG) as (keyof MediaBreakdown)[])
    .filter((k) => breakdown[k].bytes > 0);

  if (entries.length === 0 || totalBytes === 0) {
    return (
      <Box sx={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary" variant="body2">Sin datos</Typography>
      </Box>
    );
  }

  let offset = 0;
  const slices = entries.map((key) => {
    const pct = breakdown[key].bytes / totalBytes;
    const dashLen = pct * circ;
    const slice = (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={BREAKDOWN_CONFIG[key].color}
        strokeWidth={stroke}
        strokeDasharray={`${dashLen} ${circ - dashLen}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    );
    offset += dashLen;
    return slice;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e0e0e0" strokeWidth={stroke} />
      {slices}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="currentColor" fontSize="22" fontWeight={700}>
        {formatBytes(totalBytes)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="text.secondary" fontSize="11">
        total
      </text>
    </svg>
  );
}

// ──────────────────────────────────────────────
// Skeleton Loader
// ──────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={32} />
    </Box>
  );
}

// ──────────────────────────────────────────────
// Sección 1: Almacenamiento
// ──────────────────────────────────────────────

function StorageSection({ storage, loading }: { storage: StorageStats | null; loading: boolean }) {
  if (loading) return <SectionSkeleton />;
  if (!storage) {
    return (
      <Alert severity="warning" icon={<StorageIcon />}>
        <AlertTitle>Almacenamiento no disponible</AlertTitle>
        No se pudieron cargar las estadísticas de almacenamiento. Verifica la conexión con Supabase.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Barra de uso */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2.5 }}>
        <CardContent sx={{ py: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <StorageIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>
              Uso del bucket whatsapp-media
            </Typography>
            <Chip
              label={`${storage.usedPercent}% usado`}
              size="small"
              color={storage.usedPercent > 80 ? 'error' : storage.usedPercent > 50 ? 'warning' : 'success'}
              sx={{ ml: 'auto' }}
            />
          </Stack>
          <LinearProgress
            variant="determinate"
            value={storage.usedPercent}
            sx={{
              height: 10,
              borderRadius: 5,
              mb: 0.75,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                borderRadius: 5,
                background: storage.usedPercent > 80
                  ? 'linear-gradient(90deg, #ffa726, #ef5350)'
                  : 'linear-gradient(90deg, #42a5f5, #1976d2)',
              },
            }}
          />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              {formatBytes(storage.totalBytes)} usado
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatBytes(storage.freeBytes)} libre de {formatBytes(storage.bucketLimit)}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Gráfico + desglose */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} md={5}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Distribución por tipo
              </Typography>
              <DonutChart breakdown={storage.breakdown} totalBytes={storage.totalBytes} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ py: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Desglose multimedia
              </Typography>
              <Stack spacing={1.25}>
                {(Object.keys(BREAKDOWN_CONFIG) as (keyof MediaBreakdown)[]).map((key) => {
                  const item = storage.breakdown[key];
                  const cfg = BREAKDOWN_CONFIG[key];
                  const pct = storage.totalBytes > 0 ? (item.bytes / storage.totalBytes * 100) : 0;
                  return (
                    <Box key={key}>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: cfg.lightBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cfg.color }}>
                          {cfg.icon}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" fontWeight={600}>{cfg.label}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {pct.toFixed(0)}% · {formatBytes(item.bytes)}
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{ height: 4, borderRadius: 2, mt: 0.5, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: cfg.color, borderRadius: 2 } }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: 'right' }}>
                          {item.count} arch.
                        </Typography>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* KPIs */}
      <Grid container spacing={2}>
        {[
          { label: 'Archivos multimedia', value: formatNumber(storage.totalObjects), icon: <StorageIcon />, color: '#1976d2', bg: '#e3f2fd' },
          { label: 'Assets trackeados', value: formatNumber(storage.breakdown.image.count + storage.breakdown.video.count + storage.breakdown.audio.count + storage.breakdown.document.count), icon: <InfoIcon />, color: '#2e7d32', bg: '#e8f5e9' },
          { label: 'Chats con multimedia', value: '—', icon: <ChatIcon />, color: '#ed6c02', bg: '#fff3e0' },
          { label: 'Libres', value: formatBytes(storage.freeBytes), icon: <SpeedIcon />, color: '#7b1fa2', bg: '#f3e5f5' },
        ].map((kpi) => (
          <Grid item xs={6} sm={3} key={kpi.label}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
              <CardContent sx={{ textAlign: 'center', py: 2, px: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 0.75, color: kpi.color }}>
                  <Box sx={{ fontSize: 18, lineHeight: 0, display: 'flex' }}>{kpi.icon}</Box>
                </Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: kpi.color, lineHeight: 1.2 }}>
                  {kpi.value}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  {kpi.label}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

// ──────────────────────────────────────────────
// Sección 2: Chats pesados
// ──────────────────────────────────────────────

function HeavyChatsSection({
  chats,
  loading,
  onRefresh,
}: {
  chats: HeavyChat[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; chat: HeavyChat | null; mode: 'media' | 'chat' }>({ open: false, chat: null, mode: 'media' });
  const [deleting, setDeleting] = useState(false);

  const handleDeleteMedia = (chat: HeavyChat) => {
    setDeleteDialog({ open: true, chat, mode: 'media' });
  };

  const handleDeleteChat = (chat: HeavyChat) => {
    setDeleteDialog({ open: true, chat, mode: 'chat' });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.chat) return;
    setDeleting(true);
    try {
      if (deleteDialog.mode === 'media') {
        // Eliminar multimedia asociada a esta conversación
        await supabase
          .from('whatsapp_media_assets')
          .delete()
          .eq('conversation_stable_key', deleteDialog.chat.stableKey);
      } else {
        // Eliminar toda la conversación (cascade a mensajes y multimedia)
        await supabase
          .from('whatsapp_conversations')
          .delete()
          .eq('stable_key', deleteDialog.chat.stableKey);
      }
      setDeleteDialog({ open: false, chat: null, mode: 'media' });
      onRefresh();
    } catch (e) {
      console.error('Error eliminando:', e);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <SectionSkeleton />;

  if (chats.length === 0) {
    return (
      <Alert severity="info" icon={<ChatIcon />}>
        No hay conversaciones con datos multimedia para mostrar.
      </Alert>
    );
  }

  return (
    <>
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChatIcon color="warning" />
            <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
              Ranking de chats por peso
            </Typography>
            <Chip label={`${chats.length} chats`} size="small" variant="outlined" />
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: (t) => (t.palette.mode === 'dark' ? 'action.hover' : 'grey.50') }}>
                  <TableCell sx={{ fontWeight: 600, pl: 2.5 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Contacto</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Teléfono</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Mensajes</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Multimedia</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Peso total</TableCell>
                  <TableCell sx={{ fontWeight: 600, pr: 2.5 }} align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {chats.map((chat, i) => (
                  <TableRow key={chat.stableKey} hover>
                    <TableCell sx={{ pl: 2.5, color: i < 3 ? 'warning.main' : 'text.secondary', fontWeight: i < 3 ? 700 : 400 }}>
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 180 }}>
                        {chat.contactName || 'Sin nombre'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {chat.contactPhone || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatNumber(chat.messageCount)}</TableCell>
                    <TableCell align="right">
                      <Chip label={chat.mediaCount} size="small" color={chat.mediaCount > 10 ? 'warning' : 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700} color={chat.totalBytes > 10_485_760 ? 'error.main' : 'text.primary'}>
                        {formatBytes(chat.totalBytes)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ pr: 2.5 }}>
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="Eliminar multimedia de este chat">
                          <IconButton size="small" color="warning" onClick={() => handleDeleteMedia(chat)}>
                            <DeleteSweepIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar todo el chat y su contenido">
                          <IconButton size="small" color="error" onClick={() => handleDeleteChat(chat)}>
                            <WarningIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ px: 2.5, py: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary">
              <WarningIcon sx={{ fontSize: 14, verticalAlign: 'text-bottom', mr: 0.5 }} />
              Al eliminar un chat completo se borran también todos sus mensajes y archivos multimedia en cascada.
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Dialog de confirmación */}
      <Dialog open={deleteDialog.open} onClose={() => !deleting && setDeleteDialog({ open: false, chat: null, mode: 'media' })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {deleteDialog.mode === 'media' ? 'Eliminar multimedia' : 'Eliminar todo el chat'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {deleteDialog.mode === 'media' ? (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Se eliminarán todos los archivos multimedia de esta conversación.
                </Alert>
                <Typography variant="body2">
                  <strong>Chat:</strong> {deleteDialog.chat?.contactName || deleteDialog.chat?.contactPhone || 'Desconocido'}
                </Typography>
                <Typography variant="body2">
                  <strong>Multimedia a eliminar:</strong> {deleteDialog.chat?.mediaCount} archivos ({deleteDialog.chat ? formatBytes(deleteDialog.chat.totalBytes) : '—'})
                </Typography>
              </Box>
            ) : (
              <Box>
                <Alert severity="error" sx={{ mb: 2 }}>
                  Esta acción eliminará <strong>toda la conversación</strong>, incluyendo todos los mensajes y archivos multimedia asociados. No se puede deshacer.
                </Alert>
                <Typography variant="body2">
                  <strong>Chat:</strong> {deleteDialog.chat?.contactName || deleteDialog.chat?.contactPhone || 'Desconocido'}
                </Typography>
                <Typography variant="body2">
                  <strong>Mensajes:</strong> {deleteDialog.chat?.messageCount}
                </Typography>
                <Typography variant="body2">
                  <strong>Multimedia:</strong> {deleteDialog.chat?.mediaCount} archivos
                </Typography>
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, chat: null, mode: 'media' })} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={deleteDialog.mode === 'chat' ? 'error' : 'warning'}
            onClick={confirmDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {deleting ? 'Eliminando...' : deleteDialog.mode === 'media' ? 'Eliminar multimedia' : 'Eliminar todo'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ──────────────────────────────────────────────
// Sección 3: Métricas generales
// ──────────────────────────────────────────────

function GeneralMetricsSection({ metrics, loading }: { metrics: GeneralMetrics | null; loading: boolean }) {
  if (loading) return <SectionSkeleton />;
  if (!metrics) {
    return (
      <Alert severity="warning">
        <AlertTitle>Métricas no disponibles</AlertTitle>
        No se pudieron cargar las métricas generales.
      </Alert>
    );
  }

  const metricCards = [
    { label: 'Conversaciones', value: formatNumber(metrics.conversations), icon: <ChatIcon />, color: '#1976d2', bg: '#e3f2fd' },
    { label: 'Mensajes', value: formatNumber(metrics.messages), icon: <TextIcon />, color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'Activas', value: formatNumber(metrics.activeConversations), icon: <ChatIcon />, color: '#00897b', bg: '#e0f2f1' },
    { label: 'Leads', value: formatNumber(metrics.leads), icon: <PeopleIcon />, color: '#ed6c02', bg: '#fff3e0' },
    { label: 'Clientes', value: formatNumber(metrics.clients), icon: <BusinessIcon />, color: '#7b1fa2', bg: '#f3e5f5' },
    { label: 'Citas', value: formatNumber(metrics.appointments), icon: <CalendarIcon />, color: '#1565c0', bg: '#e3f2fd' },
    { label: 'Assets multimedia', value: formatNumber(metrics.mediaAssets), icon: <PhotoIcon />, color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'Blocklist', value: formatNumber(metrics.blocklisted), icon: <BlockIcon />, color: '#d32f2f', bg: '#ffebee' },
    { label: 'Broadcasts', value: formatNumber(metrics.broadcastJobs), icon: <CampaignIcon />, color: '#6a1b9a', bg: '#f3e5f5' },
    { label: 'Tags', value: formatNumber(metrics.tags), icon: <InfoIcon />, color: '#00838f', bg: '#e0f7fa' },
    { label: 'Admins', value: formatNumber(metrics.adminProfiles), icon: <AdminIcon />, color: '#37474f', bg: '#eceff1' },
  ];

  return (
    <Grid container spacing={2}>
      {metricCards.map((m) => (
        <Grid item xs={6} sm={4} md={3} lg={2} key={m.label}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 2 } }}>
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 0.75, color: m.color }}>
                <Box sx={{ fontSize: 18, lineHeight: 0, display: 'flex' }}>{m.icon}</Box>
              </Box>
              <Typography variant="h5" fontWeight={800} sx={{ color: m.color, lineHeight: 1.2 }}>
                {m.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={500}>
                {m.label}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

// ──────────────────────────────────────────────
// Sección 4: Conexiones
// ──────────────────────────────────────────────

function ConnectionsSection({ connections, loading }: { connections: ConnectionStatus; loading: boolean }) {
  if (loading) return <SectionSkeleton />;

  const items: { label: string; status: ConnectionStatus[keyof ConnectionStatus]; icon: React.ReactNode }[] = [
    { label: 'Supabase (Postgres)', status: connections.supabase, icon: <StorageIcon /> },
    { label: 'Firebase (Functions)', status: connections.firebase, icon: <AdminIcon /> },
    { label: 'WhatsApp Cloud API', status: connections.whatsappApi, icon: <ChatIcon /> },
  ];

  return (
    <Grid container spacing={2}>
      {items.map((item) => {
        const isOk = item.status.status === 'ok';
        const isChecking = item.status.status === 'checking';
        const latency = 'latency' in item.status ? (item.status as { latency?: number }).latency : undefined;
        const error = 'error' in item.status ? (item.status as { error?: string }).error : undefined;

        return (
          <Grid item xs={12} md={4} key={item.label}>
            <Card elevation={0} sx={{
              border: '1px solid',
              borderColor: isOk ? 'success.light' : isChecking ? 'warning.light' : 'error.light',
              borderRadius: 2,
              height: '100%',
              bgcolor: isOk ? 'success.50' : isChecking ? 'warning.50' : 'error.50',
            }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                  {isChecking ? (
                    <PendingIcon color="warning" />
                  ) : isOk ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <ErrorIcon color="error" />
                  )}
                  <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
                    {item.label}
                  </Typography>
                  <Chip
                    label={isChecking ? 'Verificando...' : isOk ? 'Conectado' : 'Error'}
                    size="small"
                    color={isOk ? 'success' : isChecking ? 'warning' : 'error'}
                  />
                </Stack>
                {latency !== undefined && (
                  <Typography variant="caption" color="text.secondary">
                    Latencia: {latency}ms
                  </Typography>
                )}
                {error && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                    {error}
                  </Typography>
                )}
                {isOk && item.label === 'WhatsApp Cloud API' && 'phoneNumberId' in item.status && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block', mt: 0.5 }}>
                    ID: {(item.status as { phoneNumberId?: string }).phoneNumberId}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────

const MonitorTab: React.FC = () => {
  const [dashboard, setDashboard] = useState<MonitorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMonitorDashboard();
      setDashboard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <SpeedIcon color="primary" sx={{ fontSize: 28 }} />
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          Monitoreo
        </Typography>
        <Chip
          label={loading ? 'Cargando...' : dashboard ? 'Datos en vivo' : 'Sin datos'}
          size="small"
          color={loading ? 'default' : 'success'}
          variant="outlined"
        />
        <Tooltip title="Recargar datos">
          <IconButton onClick={loadData} disabled={loading} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} action={<Button size="small" onClick={loadData}>Reintentar</Button>}>
          <AlertTitle>Error al cargar</AlertTitle>
          {error}
        </Alert>
      )}

      {/* Sección 1: Almacenamiento */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <StorageIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={700}>
            Almacenamiento
          </Typography>
        </Stack>
        <StorageSection storage={dashboard?.storage ?? null} loading={loading && !dashboard} />
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* Sección 2: Chats pesados */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <WarningIcon color="warning" />
          <Typography variant="subtitle1" fontWeight={700}>
            Chats más pesados
          </Typography>
        </Stack>
        <HeavyChatsSection
          chats={dashboard?.heavyChats ?? []}
          loading={loading && !dashboard}
          onRefresh={loadData}
        />
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* Sección 3: Métricas generales */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <InfoIcon color="info" />
          <Typography variant="subtitle1" fontWeight={700}>
            Métricas generales
          </Typography>
        </Stack>
        <GeneralMetricsSection metrics={dashboard?.metrics ?? null} loading={loading && !dashboard} />
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* Sección 4: Conexiones */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <CheckCircleIcon color="success" />
          <Typography variant="subtitle1" fontWeight={700}>
            Estado de conexiones
          </Typography>
        </Stack>
        <ConnectionsSection connections={dashboard?.connections ?? {
          supabase: { status: 'checking' },
          firebase: { status: 'checking' },
          whatsappApi: { status: 'checking' },
        }} loading={loading && !dashboard} />
      </Box>
    </Box>
  );
};

export default MonitorTab;
