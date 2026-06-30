import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import type { DirectoryEntry } from '@/types/lead';
import { getClassificationLabel } from '@/utils/classificationLabels';

// ── Types ────────────────────────────────────────────────────────────────

export interface DirectoryEntryDrawerProps {
  open: boolean;
  onClose: () => void;
  entry: DirectoryEntry | null;
  onEdit?: (entry: DirectoryEntry) => void;
  onDelete?: (entryId: string) => void;
}

// ── Format helpers ───────────────────────────────────────────────────────

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function fmtDate(value: string | undefined | null): string {
  if (!value) return '—';
  try {
    return format(new Date(value), "d MMM yyyy '·' HH:mm", { locale: es });
  } catch {
    return '—';
  }
}

function fmtCOP(value: number | undefined | null): string {
  if (value == null) return '—';
  return copFormatter.format(value);
}

function fmtBool(value: boolean | undefined | null): string {
  return value ? '✓' : '✗';
}

function fmtNullable(value: string | undefined | null): string {
  return value?.trim() ?? '—';
}

function fmtList(values: string[] | undefined | null): string {
  if (!values || values.length === 0) return '—';
  return values.join(', ');
}

function truncate(value: string, max = 18): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

const qualityLabels: Record<string, string> = {
  good: 'Bueno',
  standard: 'Estándar',
  bad: 'Malo',
};

const statusLabels: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  opt_out: 'Opt-out',
};

const paymentStatusLabels: Record<string, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
};

// ── Sub-components ───────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="overline"
        display="block"
        sx={{ mb: 1.5, color: 'text.secondary', letterSpacing: '0.08em' }}
      >
        {title}
      </Typography>
      <Grid container spacing={2}>
        {children}
      </Grid>
    </Box>
  );
}

interface FieldProps {
  label: string;
  value: React.ReactNode;
  xs?: number;
  sm?: number;
}

function Field({ label, value, xs = 12, sm = 6 }: FieldProps) {
  return (
    <Grid item xs={xs} sm={sm}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Grid>
  );
}

// ── Main component ───────────────────────────────────────────────────────

const DirectoryEntryDrawer: React.FC<DirectoryEntryDrawerProps> = ({
  open,
  onClose,
  entry,
  onEdit,
  onDelete,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!entry) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Entrada no encontrada</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            No hay información disponible para esta entrada del directorio.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    );
  }

  const deleteDisabled = entry.isAppUser;

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete?.(entry.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleCancelDelete = () => setConfirmDelete(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      scroll="paper"
    >
      {/* ── Header ─────────────────────────────────────── */}
      <DialogTitle sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            pt: 2,
            pb: 1,
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Ficha de contacto
          </Typography>
          <IconButton edge="end" onClick={onClose} size="small" aria-label="Cerrar">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* ── Avatar + Name ──────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          px: 3,
          py: 2.5,
        }}
      >
        <ContactAvatar
          displayName={entry.fullName}
          phone={entry.phone}
          photoUrl={entry.photoUrl}
          size={72}
          sx={{ mb: 1.5, fontSize: '1.5rem' }}
        />

        <Typography variant="h5" fontWeight={700} align="center" sx={{ mb: 1 }}>
          {entry.fullName}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
          <Chip
            label={getClassificationLabel(entry.classification)}
            size="small"
            color={entry.classification === 'user' ? 'primary' : 'default'}
            variant={entry.classification === 'user' ? 'filled' : 'outlined'}
          />
          <Chip
            label={qualityLabels[entry.qualityTag] ?? entry.qualityTag}
            size="small"
            color={
              entry.qualityTag === 'good'
                ? 'success'
                : entry.qualityTag === 'bad'
                  ? 'error'
                  : 'default'
            }
            variant="outlined"
          />
          {entry.status && (
            <Chip
              label={statusLabels[entry.status] ?? entry.status}
              size="small"
              variant="outlined"
            />
          )}
        </Stack>
      </Box>

      <Divider />

      {/* ── Content ────────────────────────────────────── */}
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        {/* 1. Identidad */}
        <Section title="Identidad">
          <Field label="Nombre completo" value={fmtNullable(entry.fullName)} />
          <Field label="Nombre mostrado" value={fmtNullable(entry.displayName)} />
          <Field
            label="Correo electrónico"
            value={
              entry.email ? (
                <Box
                  component="a"
                  href={`mailto:${entry.email}`}
                  sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  {entry.email}
                </Box>
              ) : (
                '—'
              )
            }
          />
          <Field
            label="Teléfono"
            value={
              entry.phone ? (
                <Box
                  component="a"
                  href={`tel:${entry.phone.replace(/[^\d+]/g, '')}`}
                  sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  {entry.phone}
                </Box>
              ) : (
                '—'
              )
            }
          />
          <Field label="Dirección" value={fmtNullable(entry.address)} />
          <Field label="Notas" value={fmtNullable(entry.notes)} />
        </Section>

        <Divider sx={{ mb: 2.5 }} />

        {/* 2. Vinculaciones */}
        <Section title="Vinculaciones">
          <Field
            label="ID de usuario (app)"
            value={
              entry.appUserId ? (
                <Tooltip title={entry.appUserId} arrow>
                  <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {truncate(entry.appUserId)}
                  </Typography>
                </Tooltip>
              ) : (
                '—'
              )
            }
          />
          <Field label="Usuario de app" value={fmtBool(entry.isAppUser)} />
          <Field label="ID de proveedor" value={fmtNullable(entry.providerId)} />
          <Field label="ID de servicio" value={fmtNullable(entry.serviceId)} />
        </Section>

        <Divider sx={{ mb: 2.5 }} />

        {/* 3. CRM */}
        <Section title="CRM">
          <Field label="Clasificación" value={getClassificationLabel(entry.classification)} />
          <Field label="Calidad" value={qualityLabels[entry.qualityTag] ?? entry.qualityTag} />
          <Field label="Estado" value={statusLabels[entry.status] ?? entry.status} />
          <Field label="Origen" value={fmtNullable(entry.source)} />
          <Field label="Canales" value={fmtList(entry.channels)} />
          <Field
            label="Etiquetas"
            xs={12}
            sm={12}
            value={
              entry.tags.length > 0 ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {entry.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" />
                  ))}
                </Stack>
              ) : (
                '—'
              )
            }
          />
        </Section>

        <Divider sx={{ mb: 2.5 }} />

        {/* 4. Facturación */}
        <Section title="Facturación">
          <Field label="Estado de pago" value={paymentStatusLabels[entry.paymentStatus ?? ''] ?? fmtNullable(entry.paymentStatus)} />
          <Field label="Monto pendiente" value={fmtCOP(entry.pendingAmount)} />
          <Field label="Citas pendientes" value={String(entry.pendingAppointmentsCount)} />
          <Field label="Último cobro" value={fmtCOP(entry.lastChargedAmount)} />
          <Field label="Requiere OTP" value={fmtBool(entry.otpRequired)} />
          <Field label="Dirección preferida" value={fmtNullable(entry.preferredServiceAddressLine)} xs={12} sm={6} />
          <Field label="Ref. dirección" value={fmtNullable(entry.preferredServiceAddressRef)} xs={12} sm={6} />
        </Section>

        <Divider sx={{ mb: 2.5 }} />

        {/* 5. WhatsApp */}
        <Section title="WhatsApp">
          <Field label="Último mensaje" value={fmtDate(entry.lastWhatsAppMessageAt)} />
          <Field
            label="Texto del último mensaje"
            value={
              entry.lastWhatsAppMessageText ? (
                <Typography variant="body2" sx={{ fontStyle: 'italic', wordBreak: 'break-word' }}>
                  "{entry.lastWhatsAppMessageText}"
                </Typography>
              ) : (
                '—'
              )
            }
          />
          <Field label="Mensajes no leídos" value={String(entry.unreadWhatsAppCount)} />
          <Field label="Asignado a" value={fmtNullable(entry.whatsAppAssignedTo)} />
          <Field
            label="ID de conversación"
            value={
              entry.whatsAppConversationId ? (
                <Tooltip title={entry.whatsAppConversationId} arrow>
                  <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {truncate(entry.whatsAppConversationId)}
                  </Typography>
                </Tooltip>
              ) : (
                '—'
              )
            }
          />
        </Section>

        <Divider sx={{ mb: 2.5 }} />

        {/* 6. Auditoría */}
        <Section title="Auditoría">
          <Field label="Creado el" value={fmtDate(entry.createdAt)} />
          <Field label="Actualizado el" value={fmtDate(entry.updatedAt)} />
          <Field label="Última sincronización" value={fmtDate(entry.lastSyncedAt)} />
          <Field
            label="ID interno"
            value={
              <Tooltip title={entry.id} arrow>
                <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                  {truncate(entry.id, 24)}
                </Typography>
              </Tooltip>
            }
          />
        </Section>
      </DialogContent>

      {/* ── Footer Actions ─────────────────────────────── */}
      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
          {/* Delete */}
          {!deleteDisabled && onDelete && (
            confirmDelete ? (
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  onClick={handleDeleteClick}
                  startIcon={<DeleteIcon />}
                >
                  Confirmar eliminación
                </Button>
                <Button size="small" onClick={handleCancelDelete}>
                  Cancelar
                </Button>
              </Stack>
            ) : (
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={handleDeleteClick}
                startIcon={<DeleteIcon />}
              >
                Eliminar
              </Button>
            )
          )}

          {/* Spacer */}
          <Box sx={{ flex: 1 }} />

          {/* Edit */}
          {onEdit && (
            <Button
              variant="contained"
              onClick={() => onEdit(entry)}
              startIcon={<EditIcon />}
              size="small"
            >
              Editar contacto
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

export default DirectoryEntryDrawer;
