import React, { useMemo, useRef } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useSearchParams } from 'react-router-dom';
import type {
  ClientSegmentsMetrics,
  DirectoryClientMetricRow,
} from '@/types/whatsapp';
import DirectoryClassificationTagPicker from '@/components/directory/DirectoryClassificationTagPicker';
import {
  addStyledSheet,
  downloadWorkbook,
  excelGeneratedAtLine,
} from './utils/exportMetricsExcel';
import MetricsSection from './MetricsSection';

export type ClientSegmentKey =
  | 'potential'
  | 'clients'
  | 'company'
  | 'recurring'
  | 'active'
  | 'inactive'
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
  color: string;
  bg: string;
  icon: React.ReactNode;
  /** Base para el porcentaje: audiencia total o clientes reales. */
  base: 'total' | 'clients';
  pick: (s: ClientSegmentsMetrics) => number;
}> = [
  {
    key: 'potential',
    label: 'Público de interés',
    color: '#1976d2',
    bg: '#e3f2fd',
    icon: <PeopleAltOutlinedIcon />,
    base: 'total',
    pick: (s) => s.total,
  },
  {
    key: 'clients',
    label: 'Clientes (agendaron)',
    color: '#2e7d32',
    bg: '#e8f5e9',
    icon: <EventAvailableOutlinedIcon />,
    base: 'total',
    pick: (s) => s.clients,
  },
  {
    key: 'active',
    label: 'Clientes activos',
    color: '#00897b',
    bg: '#e0f2f1',
    icon: <CheckCircleOutlineIcon />,
    base: 'clients',
    pick: (s) => s.active,
  },
  {
    key: 'inactive',
    label: 'Inactivos (reactivar)',
    color: '#d32f2f',
    bg: '#ffebee',
    icon: <NotificationsActiveOutlinedIcon />,
    base: 'clients',
    pick: (s) => s.inactive,
  },
  {
    key: 'blacklist',
    label: 'Lista negra',
    color: '#b71c1c',
    bg: '#ffcdd2',
    icon: <BlockOutlinedIcon />,
    base: 'clients',
    pick: (s) => s.blacklist ?? 0,
  },
  {
    key: 'company',
    label: 'Clientes empresa',
    color: '#6a1b9a',
    bg: '#f3e5f5',
    icon: <BusinessOutlinedIcon />,
    base: 'clients',
    pick: (s) => s.company,
  },
  {
    key: 'recurring',
    label: 'Clientes recurrentes',
    color: '#ed6c02',
    bg: '#fff3e0',
    icon: <AutorenewOutlinedIcon />,
    base: 'clients',
    pick: (s) => s.recurring,
  },
];

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

const ClientSegmentsSection: React.FC<ClientSegmentsSectionProps> = ({
  segments,
  clients = [],
  loading,
  onReload,
}) => {
  const [, setSearchParams] = useSearchParams();
  const [selected, setSelected] = React.useState<ClientSegmentKey | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const drillRef = useRef<HTMLDivElement>(null);

  const goToReactivations = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'automations');
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

  const showAppointmentColumn =
    selected === 'clients' ||
    selected === 'active' ||
    selected === 'inactive' ||
    selected === 'company' ||
    selected === 'recurring' ||
    selected === 'blacklist';

  const showReasonColumn = selected === 'blacklist';

  const handleSelect = (key: ClientSegmentKey) => {
    setSelected((prev) => {
      const next = prev === key ? null : key;
      setDetailOpen(next !== null);
      return next;
    });
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
        ],
        rows: clientRows,
      });
    });
  };

  const colSpan =
    3 + (showAppointmentColumn ? 1 : 0) + (showReasonColumn ? 1 : 0);

  return (
    <MetricsSection
      title="Clientes"
      subtitle="Público de interés = directorio activo sin TEST/opt-out. Cliente = agendó ≥1 vez (Firebase, 24 meses). Activo = última cita ≤ 30 días; inactivo = > 30 días. Lista negra = Decline/🚫/Bloqueado o bloqueado en inbox — incluye no-clientes; no cuenta en activos/inactivos. Clic en un KPI para el detalle; edita tags en la columna Tags."
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
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
            >
              <Typography variant="body2" color="text.secondary">
                {filtered.length} contacto(s) · segmento «
                {CARDS.find((c) => c.key === selected)?.label}»
              </Typography>
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.slice(0, 200).map((client) => {
                    const days = daysSince(client.lastAppointmentDate);
                    return (
                      <TableRow key={client.id} hover>
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
                        <TableCell sx={{ minWidth: 180 }}>
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
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Selecciona un KPI para ver el detalle.
          </Typography>
        )
      }
    >
      <Grid container spacing={2}>
        {CARDS.map((card) => {
          const count = segments ? card.pick(segments) : 0;
          const base = segments
            ? card.base === 'clients'
              ? segments.clients
              : segments.total
            : 0;
          const pct = base > 0 ? Math.round((count / base) * 1000) / 10 : 0;
          const pctLabel =
            card.key === 'potential'
              ? 'audiencia total'
              : `${pct}% de ${card.base === 'clients' ? 'clientes' : 'la audiencia'}`;
          const isSelected = selected === card.key;
          return (
            <Grid item xs={6} sm={4} md={3} lg={true} key={card.key}>
              <Card
                elevation={0}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => handleSelect(card.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(card.key);
                  }
                }}
                sx={{
                  height: '100%',
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: isSelected ? card.color : 'divider',
                  borderRadius: 2,
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                  '&:hover': { boxShadow: 3 },
                }}
              >
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      bgcolor: card.bg,
                      color: card.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 1,
                    }}
                  >
                    {card.icon}
                  </Box>
                  {loading ? (
                    <CircularProgress size={22} />
                  ) : (
                    <Typography variant="h4" fontWeight={800} sx={{ color: card.color }}>
                      {count.toLocaleString('es-CO')}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {card.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {pctLabel}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </MetricsSection>
  );
};

export default ClientSegmentsSection;
