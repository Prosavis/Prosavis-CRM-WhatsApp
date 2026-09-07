import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  ClientSegmentsMetrics,
  DirectoryClientMetricRow,
} from '@/types/whatsapp';
import DirectoryClassificationTagPicker from '@/components/directory/DirectoryClassificationTagPicker';
import BlacklistClientDetailDialog from './BlacklistClientDetailDialog';
import {
  addStyledSheet,
  downloadWorkbook,
  excelGeneratedAtLine,
} from './utils/exportMetricsExcel';
import MetricsSection from './MetricsSection';
import MetricsContextBanner from './shared/MetricsContextBanner';
import MetricsKpiCard from './shared/MetricsKpiCard';
import MetricsKpiGrid from './shared/MetricsKpiGrid';
import { openWhatsAppInbox } from '@/utils/openWhatsAppInbox';
import { whatsappDesktopUrl } from '@/utils/whatsappDesktopUrl';

export type ClientSegmentKey =
  | 'potential'
  | 'clients'
  | 'company'
  | 'recurring'
  | 'active'
  | 'inactive'
  | 'favorites'
  | 'blacklist';

interface ClientSegmentsSectionProps {
  segments?: ClientSegmentsMetrics;
  clients?: DirectoryClientMetricRow[];
  loading: boolean;
  /** Tras editar tags, refresca KPIs/segmentos. */
  onReload?: () => void;
}

const CARDS: Array<{
  key: ClientSegmentKey;
  label: string;
  accent: string;
  tone?: 'default' | 'success' | 'warning' | 'risk' | 'info' | 'neutral';
  group: 'Audiencia' | 'Relación' | 'Operación';
  /** Base para el porcentaje: audiencia total o clientes reales. */
  base: 'total' | 'clients';
  pick: (s: ClientSegmentsMetrics) => number;
}> = [
  {
    key: 'potential',
    label: 'Público de interés',
    accent: 'primary.main',
    group: 'Audiencia',
    base: 'total',
    pick: (s) => s.total,
  },
  {
    key: 'clients',
    label: 'Clientes (agendaron)',
    accent: 'success.main',
    tone: 'success',
    group: 'Audiencia',
    base: 'total',
    pick: (s) => s.clients,
  },
  {
    key: 'active',
    label: 'Clientes activos',
    accent: 'success.dark',
    tone: 'success',
    group: 'Relación',
    base: 'clients',
    pick: (s) => s.active,
  },
  {
    key: 'inactive',
    label: 'Inactivos (reactivar)',
    accent: 'warning.dark',
    tone: 'warning',
    group: 'Operación',
    base: 'clients',
    pick: (s) => s.inactive,
  },
  {
    key: 'favorites',
    label: 'Clientes favoritos',
    accent: 'success.main',
    tone: 'success',
    group: 'Relación',
    // Tag manual; % sobre audiencia (no exige cita Firebase).
    base: 'total',
    pick: (s) => s.favorites ?? 0,
  },
  {
    key: 'blacklist',
    label: 'Lista negra',
    accent: 'error.main',
    tone: 'risk',
    group: 'Operación',
    // Incluye no-clientes (equipo, leads, etc.): % sobre audiencia, no sobre clientes.
    base: 'total',
    pick: (s) => s.blacklist ?? 0,
  },
  {
    key: 'company',
    label: 'Clientes empresa',
    accent: 'secondary.dark',
    group: 'Relación',
    base: 'clients',
    pick: (s) => s.company,
  },
  {
    key: 'recurring',
    label: 'Clientes recurrentes',
    accent: 'info.main',
    tone: 'info',
    group: 'Relación',
    base: 'clients',
    pick: (s) => s.recurring,
  },
];

const SEGMENT_GROUPS = ['Audiencia', 'Relación', 'Operación'] as const;

function matchesSegment(client: DirectoryClientMetricRow, key: ClientSegmentKey): boolean {
  switch (key) {
    case 'potential':
      return true;
    case 'clients':
      return client.isClient;
    case 'company':
      return client.isClient && client.isCompany;
    case 'recurring':
      return client.isClient && client.isRecurring;
    case 'active':
      return client.isActive && !client.isBlacklisted;
    case 'inactive':
      return client.isClient && !client.isActive && !client.isBlacklisted;
    case 'favorites':
      return client.isFavorite === true;
    case 'blacklist':
      return client.isBlacklisted;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function formatLastAppointment(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function clientEstado(c: DirectoryClientMetricRow): string {
  if (c.isBlacklisted) return 'lista negra';
  if (c.isActive) return 'activo';
  if (c.isClient) return 'inactivo';
  return 'sin citas';
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

const ClientSegmentsSection: React.FC<ClientSegmentsSectionProps> = ({
  segments,
  clients = [],
  loading,
  onReload,
}) => {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [selected, setSelected] = React.useState<ClientSegmentKey | null>(null);
  const [inboxBusyId, setInboxBusyId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailRow, setDetailRow] = React.useState<DirectoryClientMetricRow | null>(null);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(50);
  const drillRef = useRef<HTMLDivElement>(null);

  const goToReactivations = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'automations');
        next.delete('layer');
        next.set('auto', 'reactivations');
        return next;
      },
      { replace: true },
    );
  };

  const filtered = useMemo(() => {
    if (!selected) return [];
    const rows = clients.filter((c) => matchesSegment(c, selected));
    if (selected === 'inactive') {
      return [...rows].sort((a, b) =>
        (a.lastAppointmentDate ?? '').localeCompare(b.lastAppointmentDate ?? ''),
      );
    }
    return rows;
  }, [clients, selected]);

  useEffect(() => {
    setPage(0);
  }, [selected, rowsPerPage, clients]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = filtered.length === 0 ? 0 : safePage * rowsPerPage;
  const pageEnd = Math.min(pageStart + rowsPerPage, filtered.length);
  const pageRows = filtered.slice(pageStart, pageEnd);

  /** KPI del segmento vs filas recibidas del API (deben coincidir si el payload está completo). */
  const segmentKpiTotal =
    selected && segments ? (CARDS.find((c) => c.key === selected)?.pick(segments) ?? 0) : 0;
  const loadedForSegment = filtered.length;
  const payloadComplete = segmentKpiTotal === 0 || loadedForSegment >= segmentKpiTotal;

  const showAppointmentColumn =
    selected === 'clients' ||
    selected === 'active' ||
    selected === 'inactive' ||
    selected === 'favorites' ||
    selected === 'company' ||
    selected === 'recurring' ||
    selected === 'blacklist';

  const showReasonColumn = selected === 'blacklist';
  const showActionsColumn = selected === 'favorites';

  const openFavoriteInbox = useCallback(
    async (client: DirectoryClientMetricRow) => {
      setInboxBusyId(client.id);
      try {
        await openWhatsAppInbox({
          navigate,
          phone: client.phone,
          name: client.name,
        });
      } finally {
        setInboxBusyId(null);
      }
    },
    [navigate],
  );

  const handleSelect = (key: ClientSegmentKey) => {
    setSelected((prev) => {
      const next = prev === key ? null : key;
      setDetailOpen(next !== null);
      return next;
    });
    setPage(0);
    requestAnimationFrame(() => {
      drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleDownload = () => {
    const list = selected ? filtered : clients;
    const segmentLabel = selected
      ? CARDS.find((c) => c.key === selected)?.label ?? selected
      : 'Todos los contactos';

    const resumenRows = CARDS.map((card) => {
      const count = segments ? card.pick(segments) : 0;
      const base = segments
        ? card.base === 'clients'
          ? segments.clients
          : segments.total
        : 0;
      const pct = base > 0 ? Math.round((count / base) * 1000) / 10 : 0;
      return [card.label, count, card.key === 'potential' ? null : pct];
    });

    const clientRows = list.map((c) => [
      c.name ?? '',
      c.phone ?? '',
      (c.tags ?? []).join(', '),
      c.isClient ? 'Sí' : 'No',
      clientEstado(c),
      c.blacklistReason ?? '',
      c.lastAppointmentDate ?? null,
      c.isCompany ? 'Sí' : 'No',
      c.isRecurring ? 'Sí' : 'No',
      c.isFavorite ? 'Sí' : 'No',
    ]);

    void downloadWorkbook(`clientes-${selected ?? 'todos'}.xlsx`, (wb) => {
      addStyledSheet(wb, {
        name: 'Resumen',
        title: 'Segmentos de clientes',
        subtitle: 'Conteos por segmento del directorio (audiencia y clientes reales).',
        meta: [excelGeneratedAtLine()],
        columns: [
          { header: 'Segmento', type: 'text' },
          { header: 'Conteo', type: 'int' },
          { header: '% de su base', type: 'percent' },
        ],
        rows: resumenRows,
      });
      addStyledSheet(wb, {
        name: 'Clientes',
        title: `Clientes · ${segmentLabel}`,
        subtitle: `${list.length.toLocaleString('es-CO')} contacto(s) exportado(s).`,
        meta: [excelGeneratedAtLine()],
        columns: [
          { header: 'Nombre', type: 'text' },
          { header: 'Teléfono', type: 'text' },
          { header: 'Tags', type: 'text', width: 30 },
          { header: 'Es cliente', type: 'text' },
          { header: 'Estado', type: 'text' },
          { header: 'Motivo lista negra', type: 'text', width: 30 },
          { header: 'Última cita', type: 'date' },
          { header: 'Empresa', type: 'text' },
          { header: 'Recurrente', type: 'text' },
          { header: 'Favorito', type: 'text' },
        ],
        rows: clientRows,
      });
    });
  };

  const colSpan =
    3 +
    (showAppointmentColumn ? 1 : 0) +
    (showReasonColumn ? 1 : 0) +
    (showActionsColumn ? 1 : 0);

  return (
    <MetricsSection
      title="¿Cómo se compone el directorio?"
      subtitle="Selecciona un KPI para abrir las filas que explican el segmento y editar sus tags."
      expanded={detailOpen}
      onExpandedChange={setDetailOpen}
      onDownload={handleDownload}
      downloadLabel="Descargar clientes Excel"
      detail={
        selected ? (
          <Box ref={drillRef}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ sm: 'flex-start' }}
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
            >
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Segmento «{CARDS.find((c) => c.key === selected)?.label}»
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total en segmento (KPI): {segmentKpiTotal.toLocaleString('es-CO')} · Cargados del
                  servidor: {loadedForSegment.toLocaleString('es-CO')}
                  {payloadComplete ? ' (completo)' : ' (incompleto)'} · Mostrando{' '}
                  {filtered.length === 0
                    ? '0'
                    : `${(pageStart + 1).toLocaleString('es-CO')}–${pageEnd.toLocaleString('es-CO')}`}{' '}
                  de {loadedForSegment.toLocaleString('es-CO')} · Página{' '}
                  {filtered.length === 0 ? 0 : safePage + 1} de {filtered.length === 0 ? 0 : pageCount}
                </Typography>
                {selected === 'potential' && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    Público de interés = audiencia del directorio (sin TEST / opt-out / inactivos de
                    status). No se montan las 2000+ filas a la vez: se paginan en el cliente; el Excel
                    exporta el segmento completo.
                  </Typography>
                )}
              </Box>
              {selected === 'inactive' && (
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={goToReactivations}
                  sx={{ textTransform: 'none', flexShrink: 0 }}
                >
                  Ir a reactivaciones
                </Button>
              )}
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Teléfono</TableCell>
                    {showAppointmentColumn && <TableCell>Última cita</TableCell>}
                    {showReasonColumn && <TableCell>Motivo</TableCell>}
                    <TableCell>Tags</TableCell>
                    {showActionsColumn && <TableCell align="right">Acciones</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.map((client) => {
                    const days = daysSince(client.lastAppointmentDate);
                    const rowClickable = selected === 'blacklist';
                    const desktopUrl = whatsappDesktopUrl(client.phone);
                    const inboxBusy = inboxBusyId === client.id;
                    return (
                      <TableRow
                        key={client.id}
                        hover
                        onClick={rowClickable ? () => setDetailRow(client) : undefined}
                        sx={rowClickable ? { cursor: 'pointer' } : undefined}
                      >
                        <TableCell>{client.name || '—'}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                          {client.phone || '—'}
                        </TableCell>
                        {showAppointmentColumn && (
                          <TableCell>
                            {formatLastAppointment(client.lastAppointmentDate)}
                            {selected === 'inactive' && days != null && (
                              <Typography
                                component="span"
                                variant="caption"
                                color="error"
                                sx={{ ml: 0.75 }}
                              >
                                (hace {days} días)
                              </Typography>
                            )}
                          </TableCell>
                        )}
                        {showReasonColumn && (
                          <TableCell sx={{ maxWidth: 240 }}>
                            <Typography variant="body2" noWrap title={client.blacklistReason ?? ''}>
                              {client.blacklistReason || '—'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell
                          sx={{ minWidth: 180 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DirectoryClassificationTagPicker
                            entry={{
                              id: client.id,
                              classification: client.classification,
                              tags: client.tags ?? [],
                            }}
                            compact
                            autoSave
                            onSaved={() => onReload?.()}
                          />
                        </TableCell>
                        {showActionsColumn && (
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Abrir en Inbox CRM">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    disabled={!client.phone || inboxBusy}
                                    onClick={() => void openFavoriteInbox(client)}
                                    aria-label={`Abrir ${client.name || 'contacto'} en Inbox`}
                                  >
                                    {inboxBusy ? (
                                      <CircularProgress size={16} color="inherit" />
                                    ) : (
                                      <InboxOutlinedIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Abrir en WhatsApp Desktop">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={!desktopUrl}
                                    aria-label={`Abrir ${client.name || 'contacto'} en WhatsApp`}
                                    sx={{ color: desktopUrl ? '#25D366' : undefined }}
                                    onClick={() => {
                                      if (desktopUrl) window.location.href = desktopUrl;
                                    }}
                                  >
                                    <WhatsAppIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={colSpan} align="center">
                        Sin contactos en este segmento
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filtered.length}
              page={filtered.length === 0 ? 0 : safePage}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(Number.parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
              labelRowsPerPage="Filas por página"
              labelDisplayedRows={({ from, to, count }) =>
                `${from.toLocaleString('es-CO')}–${to.toLocaleString('es-CO')} de ${
                  count === -1 ? '…' : count.toLocaleString('es-CO')
                }`
              }
              sx={{ borderTop: 1, borderColor: 'divider', mt: 0.5 }}
            />
            {selected === 'blacklist' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Clic en una fila para ver la tarjeta y editar el motivo de lista negra.
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Selecciona un KPI para ver el detalle.
          </Typography>
        )
      }
    >
      <MetricsContextBanner summary="Definiciones de audiencia y relación">
        Público de interés excluye TEST y opt-out. Cliente significa que agendó al menos una vez
        durante la ventana de citas de 24 meses. Activo tiene última cita en 30 días; inactivo,
        una anterior. Favoritos es un tag manual. Lista negra reúne Decline, 🚫, Bloqueado o
        bloqueo en inbox y puede incluir no-clientes.
      </MetricsContextBanner>
      <Stack spacing={2}>
        {SEGMENT_GROUPS.map((group) => (
          <Box key={group}>
            <Typography
              component="h3"
              variant="overline"
              color="text.secondary"
              fontWeight={700}
              sx={{ display: 'block', mb: 0.75 }}
            >
              {group}
            </Typography>
            <MetricsKpiGrid minWidth={185}>
              {CARDS.filter((card) => card.group === group).map((card) => {
                const count = segments ? card.pick(segments) : 0;
                const base = segments
                  ? card.base === 'clients'
                    ? segments.clients
                    : segments.total
                  : 0;
                const pct = base > 0 ? Math.round((count / base) * 1000) / 10 : 0;
                const detail =
                  card.key === 'potential'
                    ? 'audiencia total'
                    : `${pct.toLocaleString('es-CO')}% de ${
                        card.base === 'clients' ? 'clientes' : 'la audiencia'
                      }`;
                return (
                  <MetricsKpiCard
                    key={card.key}
                    label={card.label}
                    value={loading ? '…' : count.toLocaleString('es-CO')}
                    detail={detail}
                    selected={selected === card.key}
                    onClick={() => handleSelect(card.key)}
                    accent={card.accent}
                    tone={card.tone}
                  />
                );
              })}
            </MetricsKpiGrid>
          </Box>
        ))}
      </Stack>
      <BlacklistClientDetailDialog
        open={!!detailRow}
        row={detailRow}
        onClose={() => setDetailRow(null)}
        onSaved={() => onReload?.()}
      />
    </MetricsSection>
  );
};

export default ClientSegmentsSection;
