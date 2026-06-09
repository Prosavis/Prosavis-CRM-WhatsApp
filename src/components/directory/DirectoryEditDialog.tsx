import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { directoryService } from '@/services/directoryService';
import type {
  DirectoryChannel,
  DirectoryEntry,
  DirectoryClassification,
  DirectoryQualityTag,
  DirectoryStatus,
} from '@/types/lead';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateDirectoryEntryData {
  fullName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  address?: string;
  notes?: string;
  classification?: DirectoryClassification;
  qualityTag?: DirectoryQualityTag;
  status?: DirectoryStatus | string;
  source?: string;
  channels?: DirectoryChannel[];
  paymentStatus?: string;
  pendingAmount?: number;
  pendingAppointmentsCount?: number;
  lastChargedAmount?: number;
  otpRequired?: boolean;
  preferredServiceAddressLine?: string;
  preferredServiceAddressRef?: string;
  internalNotes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface DirectoryEditDialogProps {
  open: boolean;
  onClose: () => void;
  entry: DirectoryEntry;
  onSaved: (updated: DirectoryEntry) => void;
}

// ---------------------------------------------------------------------------
// Tab panel helper
// ---------------------------------------------------------------------------

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ pt: 3 }}>{children}</Box>;
}

// ---------------------------------------------------------------------------
// Read-only field renderer
// ---------------------------------------------------------------------------

function ReadOnlyField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <TextField
      label={label}
      value={value ?? '—'}
      fullWidth
      size="small"
      InputProps={{ readOnly: true }}
      sx={{ '& .MuiInputBase-root': { bgcolor: (t) => alpha(t.palette.action.disabledBackground, 0.3) } }}
    />
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLASSIFICATION_OPTIONS: { value: DirectoryClassification; label: string }[] = [
  { value: 'company', label: 'Empresa / Pro' },
  { value: 'user', label: 'Usuario' },
  { value: 'lead', label: 'Lead' },
  { value: 'unknown', label: 'Sin clasificar' },
];

const QUALITY_TAG_OPTIONS: { value: DirectoryQualityTag; label: string; color: string }[] = [
  { value: 'good', label: 'Bueno', color: 'success.main' },
  { value: 'standard', label: 'Estándar', color: 'warning.main' },
  { value: 'bad', label: 'Malo', color: 'error.main' },
];

const STATUS_OPTIONS: { value: DirectoryStatus; label: string }[] = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'opt_out', label: 'Opt-out' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'paid', label: 'Pagado' },
  { value: 'pending', label: 'Pendiente' },
  { value: '', label: 'Ninguno' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(v: string | undefined): boolean {
  if (!v) return true; // optional
  return EMAIL_RE.test(v);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DirectoryEditDialog({
  open,
  onClose,
  entry,
  onSaved,
}: DirectoryEditDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);

  // ---------- form state ----------
  const [fullName, setFullName] = useState(entry.fullName);
  const [displayName, setDisplayName] = useState(entry.displayName ?? '');
  const [email, setEmail] = useState(entry.email ?? '');
  const [phone, setPhone] = useState(entry.phone ?? '');
  const [photoUrl, setPhotoUrl] = useState(entry.photoUrl ?? '');
  const [address, setAddress] = useState(entry.address ?? '');
  const [notes, setNotes] = useState(entry.notes ?? '');

  const [classification, setClassification] = useState<DirectoryClassification>(entry.classification);
  const [qualityTag, setQualityTag] = useState<DirectoryQualityTag>(entry.qualityTag);
  const [status, setStatus] = useState<string>(entry.status);
  const [source, setSource] = useState(entry.source ?? '');
  const [channels, setChannels] = useState(entry.channels?.join(', ') ?? '');
  const [tags, setTags] = useState(entry.tags?.join(', ') ?? '');

  const [paymentStatus, setPaymentStatus] = useState(entry.paymentStatus ?? '');
  const [pendingAmount, setPendingAmount] = useState(entry.pendingAmount);
  const [pendingAppointmentsCount, setPendingAppointmentsCount] = useState(entry.pendingAppointmentsCount);
  const [lastChargedAmount, setLastChargedAmount] = useState(entry.lastChargedAmount ?? 0);
  const [otpRequired, setOtpRequired] = useState(entry.otpRequired);
  const [preferredServiceAddressLine, setPreferredServiceAddressLine] = useState(
    entry.preferredServiceAddressLine ?? '',
  );
  const [preferredServiceAddressRef, setPreferredServiceAddressRef] = useState(
    entry.preferredServiceAddressRef ?? '',
  );

  const [internalNotes, setInternalNotes] = useState(entry.internalNotes ?? '');
  const [metadata, setMetadata] = useState(
    entry.metadata ? JSON.stringify(entry.metadata, null, 2) : '',
  );

  // ---------- validation ----------
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});

  // reset form when entry changes
  useEffect(() => {
    setFullName(entry.fullName);
    setDisplayName(entry.displayName ?? '');
    setEmail(entry.email ?? '');
    setPhone(entry.phone ?? '');
    setPhotoUrl(entry.photoUrl ?? '');
    setAddress(entry.address ?? '');
    setNotes(entry.notes ?? '');
    setClassification(entry.classification);
    setQualityTag(entry.qualityTag);
    setStatus(entry.status);
    setSource(entry.source ?? '');
    setChannels(entry.channels?.join(', ') ?? '');
    setTags(entry.tags?.join(', ') ?? '');
    setPaymentStatus(entry.paymentStatus ?? '');
    setPendingAmount(entry.pendingAmount);
    setPendingAppointmentsCount(entry.pendingAppointmentsCount);
    setLastChargedAmount(entry.lastChargedAmount ?? 0);
    setOtpRequired(entry.otpRequired);
    setPreferredServiceAddressLine(entry.preferredServiceAddressLine ?? '');
    setPreferredServiceAddressRef(entry.preferredServiceAddressRef ?? '');
    setInternalNotes(entry.internalNotes ?? '');
    setMetadata(entry.metadata ? JSON.stringify(entry.metadata, null, 2) : '');
    setErrors({});
    setActiveTab(0);
  }, [entry]);

  // ---------- handlers ----------
  const handleSave = useCallback(async () => {
    // validate
    const nextErrors: { fullName?: string; email?: string } = {};
    if (!fullName.trim()) {
      nextErrors.fullName = 'El nombre es obligatorio';
    }
    if (!validateEmail(email)) {
      nextErrors.email = 'Correo electrónico inválido';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      // parse arrays
      const parsedChannels: DirectoryChannel[] = channels
        .split(',')
        .map((c) => c.trim().toUpperCase() as DirectoryChannel)
        .filter(Boolean);
      const parsedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      let parsedMetadata: Record<string, unknown> | undefined;
      if (metadata.trim()) {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch {
          console.error('El campo Metadatos contiene JSON inválido');
          setSaving(false);
          return;
        }
      }

      const payload: UpdateDirectoryEntryData = {
        fullName: fullName.trim(),
        displayName: displayName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        classification,
        qualityTag,
        status,
        source: source.trim() || undefined,
        channels: parsedChannels.length > 0 ? parsedChannels : undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        paymentStatus: paymentStatus || undefined,
        pendingAmount,
        pendingAppointmentsCount,
        lastChargedAmount: lastChargedAmount || undefined,
        otpRequired,
        preferredServiceAddressLine: preferredServiceAddressLine.trim() || undefined,
        preferredServiceAddressRef: preferredServiceAddressRef.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
        metadata: parsedMetadata,
      };

      const result = await directoryService.updateEntry(entry.id, payload);
      if (!result.success) {
        console.error('No se pudo guardar la entrada');
        setSaving(false);
        return;
      }

      // re-fetch to get the freshest version
      const fresh = await directoryService.getEntryById(entry.id);
      if (fresh) {
        onSaved(fresh);
        console.log('Entrada actualizada correctamente');
        onClose();
      } else {
        console.warn('Entrada guardada pero no se pudo recargar');
        onClose();
      }
    } catch (err) {
      console.error('Error al guardar la entrada', err);
    } finally {
      setSaving(false);
    }
  }, [
    fullName,
    displayName,
    email,
    phone,
    photoUrl,
    address,
    notes,
    classification,
    qualityTag,
    status,
    source,
    channels,
    tags,
    paymentStatus,
    pendingAmount,
    pendingAppointmentsCount,
    lastChargedAmount,
    otpRequired,
    preferredServiceAddressLine,
    preferredServiceAddressRef,
    internalNotes,
    metadata,
    entry.id,
    onSaved,
    onClose,
  ]);

  // ---------- tabs ----------
  const TABS = ['Datos básicos', 'CRM', 'Facturación', 'WhatsApp', 'Avanzado'];

  // ---------- render ----------
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      aria-labelledby="directory-edit-dialog-title"
    >
      {/* ---- header ---- */}
      <DialogTitle id="directory-edit-dialog-title" sx={{ m: 0, p: 2, pr: 8 }}>
        Editar contacto
        <IconButton
          aria-label="Cerrar"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* ---- tabs ---- */}
      <Box sx={{ px: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant={isMobile ? 'scrollable' : 'standard'}
          scrollButtons={isMobile ? 'auto' : undefined}
        >
          {TABS.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Box>

      {/* ---- content ---- */}
      <DialogContent dividers>
        {/* TAB 0 – Datos básicos */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Nombre completo *"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={!!errors.fullName}
                helperText={errors.fullName}
                fullWidth
                size="small"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nombre para mostrar"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={!!errors.email}
                helperText={errors.email}
                fullWidth
                size="small"
                type="email"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Teléfono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="URL de foto"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Dirección"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notas"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                size="small"
                multiline
                minRows={3}
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* TAB 1 – CRM */}
        <TabPanel value={activeTab} index={1}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="Clasificación"
                value={classification}
                onChange={(e) => setClassification(e.target.value as DirectoryClassification)}
                fullWidth
                size="small"
              >
                {CLASSIFICATION_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="Calidad"
                value={qualityTag}
                onChange={(e) => setQualityTag(e.target.value as DirectoryQualityTag)}
                fullWidth
                size="small"
              >
                {QUALITY_TAG_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="Estado"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                fullWidth
                size="small"
              >
                {STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Origen"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Canales (separados por coma)"
                value={channels}
                onChange={(e) => setChannels(e.target.value)}
                fullWidth
                size="small"
                helperText="Ej: whatsapp, email, phone"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Tags (separados por coma)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                fullWidth
                size="small"
                helperText="Ej: VIP, Reclamo, Frecuente"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* TAB 2 – Facturación */}
        <TabPanel value={activeTab} index={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="Estado de pago"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                fullWidth
                size="small"
              >
                {PAYMENT_STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Monto pendiente"
                value={pendingAmount}
                onChange={(e) => setPendingAmount(Number(e.target.value))}
                fullWidth
                size="small"
                type="number"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Citas pendientes"
                value={pendingAppointmentsCount}
                onChange={(e) => setPendingAppointmentsCount(Number(e.target.value))}
                fullWidth
                size="small"
                type="number"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Último cargo"
                value={lastChargedAmount}
                onChange={(e) => setLastChargedAmount(Number(e.target.value))}
                fullWidth
                size="small"
                type="number"
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <FormControlLabel
                control={
                  <Switch
                    checked={otpRequired}
                    onChange={(e) => setOtpRequired(e.target.checked)}
                  />
                }
                label="Requiere OTP"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Dirección de servicio (línea)"
                value={preferredServiceAddressLine}
                onChange={(e) => setPreferredServiceAddressLine(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Dirección de servicio (referencia)"
                value={preferredServiceAddressRef}
                onChange={(e) => setPreferredServiceAddressRef(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* TAB 3 – WhatsApp (todo read-only) */}
        <TabPanel value={activeTab} index={3}>
          <Stack spacing={2}>
            <Typography variant="subtitle2" color="text.secondary">
              Estos datos se sincronizan desde WhatsApp y son de solo lectura.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <ReadOnlyField label="Último mensaje WhatsApp (fecha)" value={entry.lastWhatsAppMessageAt} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <ReadOnlyField label="Intención" value={entry.lastWhatsAppIntent} />
              </Grid>
              <Grid item xs={12}>
                <ReadOnlyField label="Último mensaje WhatsApp (texto)" value={entry.lastWhatsAppMessageText} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <ReadOnlyField label="No leídos" value={entry.unreadWhatsAppCount} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <ReadOnlyField label="Asignado a" value={entry.whatsAppAssignedTo} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <ReadOnlyField label="Conversación ID" value={entry.whatsAppConversationId} />
              </Grid>
            </Grid>
          </Stack>
        </TabPanel>

        {/* TAB 4 – Avanzado */}
        <TabPanel value={activeTab} index={4}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Notas internas"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                fullWidth
                size="small"
                multiline
                minRows={4}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Metadatos (JSON)"
                value={metadata}
                onChange={(e) => setMetadata(e.target.value)}
                fullWidth
                size="small"
                multiline
                minRows={4}
                helperText="Objeto JSON válido"
                sx={{ '& textarea': { fontFamily: 'Consolas, monospace', fontSize: '0.8125rem' } }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <ReadOnlyField label="ID" value={entry.id} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <ReadOnlyField label="Creado" value={entry.createdAt} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <ReadOnlyField label="Actualizado" value={entry.updatedAt} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <ReadOnlyField label="Última sincronización" value={entry.lastSyncedAt} />
            </Grid>
          </Grid>
        </TabPanel>
      </DialogContent>

      {/* ---- actions ---- */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, p: 2 }}>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveOutlinedIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </Box>
    </Dialog>
  );
}
