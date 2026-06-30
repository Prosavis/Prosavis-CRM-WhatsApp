import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import type { WhatsAppConversation } from '@/services/whatsappService';
import {
  patchWhatsAppConversationAdmin,
  updateAppUserProfile,
} from '@/services/whatsappService';
import type { WhatsAppContactContextValue } from '@/hooks/useWhatsAppContactContext';
import { directoryService } from '@/services/directoryService';
import DirectoryClassificationTagPicker from '@/components/directory/DirectoryClassificationTagPicker';
import { AppointmentService } from '@/services/appointmentService';
import type { Appointment } from '@/types/appointment';
import type { DirectoryChannel, DirectoryEntry } from '@/types/lead';
import { normalizeDirectoryPhoneE164 } from '@/utils/directoryPhone';

const ENTRY_STATUSES = ['active', 'inactive', 'opt_out'];
const QUALITY_TAGS = ['good', 'standard', 'bad'];
const SEQUENCES = ['NINGUNA', 'SEGUIMIENTO', 'REBOOKING', 'SEGUIMIENTO_PAGO_RECHAZADO'];
const SOURCES = [
  '',
  'APP_USER',
  'WHATSAPP_INBOUND',
  'META_ADS',
  'REFERIDO',
  'ORGANICO',
  'BROADCAST',
  'PANEL',
];
const PAYMENT_STATUSES = ['', 'paid', 'pending'];
const CHANNEL_OPTIONS: DirectoryChannel[] = ['WHATSAPP', 'IN_APP'];

interface FormState {
  // Identidad / perfil
  fullName: string;
  displayName: string;
  email: string;
  phone: string;
  photoUrl: string;
  address: string;
  notes: string;
  department: string;
  city: string;
  // Perfil WhatsApp / conversacion
  whatsappProfileName: string;
  adminNotes: string;
  // Clasificacion CRM
  classification: string;
  qualityTag: string;
  status: string;
  source: string;
  channels: DirectoryChannel[];
  activeSequence: string;
  whatsAppAssignedTo: string;
  optOut: boolean;
  tags: string[];
  // Facturacion / servicio
  paymentStatus: string;
  pendingAmount: string;
  pendingAppointmentsCount: string;
  lastChargedAmount: string;
  otpRequired: boolean;
  preferredServiceAddressLine: string;
  preferredServiceAddressRef: string;
  // Vinculos
  appUserId: string;
  isAppUser: boolean;
  providerId: string;
  serviceId: string;
  // Internas
  internalNotes: string;
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone?.trim()) return '';
  return normalizeDirectoryPhoneE164(phone) ?? phone.trim();
}

function numToStr(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '' : String(value);
}

function buildFormState(
  entry: DirectoryEntry | null,
  conversation: WhatsAppConversation,
): FormState {
  const metadata = entry?.metadata ?? {};
  return {
    fullName: (entry?.fullName || '').trim(),
    displayName: (entry?.displayName || '').trim(),
    email: (entry?.email || '').trim(),
    phone: formatPhoneDisplay(entry?.phone),
    photoUrl: (entry?.photoUrl || '').trim(),
    address: (entry?.address || '').trim(),
    notes: (entry?.notes || '').trim(),
    department: typeof metadata.department === 'string' ? metadata.department.trim() : '',
    city: typeof metadata.city === 'string' ? metadata.city.trim() : '',
    whatsappProfileName: (conversation.whatsappProfileName || '').trim(),
    adminNotes: (conversation.adminNotes || '').trim(),
    classification: entry?.classification || 'unknown',
    qualityTag: entry?.qualityTag || 'standard',
    status: entry?.status || 'active',
    source: (entry?.source as string) || '',
    channels: (entry?.channels as DirectoryChannel[]) || [],
    activeSequence: entry?.activeSequence || 'NINGUNA',
    whatsAppAssignedTo: (entry?.whatsAppAssignedTo || '').trim(),
    optOut: entry?.optOut ?? false,
    tags: entry?.tags || [],
    paymentStatus: (entry?.paymentStatus as string) || '',
    pendingAmount: numToStr(entry?.pendingAmount),
    pendingAppointmentsCount: numToStr(entry?.pendingAppointmentsCount),
    lastChargedAmount: numToStr(entry?.lastChargedAmount),
    otpRequired: entry?.otpRequired ?? false,
    preferredServiceAddressLine: (entry?.preferredServiceAddressLine || '').trim(),
    preferredServiceAddressRef: (entry?.preferredServiceAddressRef || '').trim(),
    appUserId: (entry?.appUserId || '').trim(),
    isAppUser: entry?.isAppUser ?? false,
    providerId: (entry?.providerId || '').trim(),
    serviceId: (entry?.serviceId || '').trim(),
    internalNotes: (entry?.internalNotes || '').trim(),
  };
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    PENDING: 'Pendiente',
    PENDING_RESCHEDULE: 'Reprogramación',
    CONFIRMED: 'Confirmada',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completada',
    CANCELED: 'Cancelada',
    REJECTED: 'Rechazada',
  };
  return map[s] || s;
}

function appointmentRole(apt: Appointment, userId: string): string {
  if (apt.clientId === userId) return 'Cliente';
  if (apt.providerId === userId) return 'Proveedor';
  return '—';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('es-CO');
}

function parseNum(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

interface ReadOnlyRowProps {
  label: string;
  value: React.ReactNode;
}

const ReadOnlyRow: React.FC<ReadOnlyRowProps> = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
      {label}
    </Typography>
    <Typography
      variant="caption"
      sx={{ textAlign: 'right', wordBreak: 'break-word', maxWidth: '70%' }}
    >
      {value || '—'}
    </Typography>
  </Box>
);

interface SectionTitleProps {
  children: React.ReactNode;
}

const SectionTitle: React.FC<SectionTitleProps> = ({ children }) => (
  <Typography
    variant="caption"
    color="text.secondary"
    fontWeight={600}
    display="block"
    sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}
  >
    {children}
  </Typography>
);

interface WhatsAppContactSidePanelProps {
  conversation: WhatsAppConversation;
  contact: WhatsAppContactContextValue;
}

const WhatsAppContactSidePanel: React.FC<WhatsAppContactSidePanelProps> = ({
  conversation,
  contact,
}) => {
  const { user, directoryEntry, lead, refetch, loading } = contact;
  const entry: DirectoryEntry | null = directoryEntry ?? lead;

  const [form, setForm] = useState<FormState>(() => buildFormState(entry, conversation));
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSyncDoneRef = useRef(false);
  const hydratedIdsRef = useRef<{ conversationId: string; entryId: string | null }>({
    conversationId: '',
    entryId: null,
  });
  const syncGenRef = useRef(0);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [aptsLoading, setAptsLoading] = useState(false);

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const hydrateForm = useCallback(
    (targetEntry: DirectoryEntry | null, conv: WhatsAppConversation) => {
      const next = buildFormState(targetEntry, conv);
      setForm(next);
      setSavedSnapshot(JSON.stringify(next));
    },
    [],
  );

  useEffect(() => {
    const entryId = entry?.id ?? null;
    const convId = conversation.id;
    if (
      hydratedIdsRef.current.conversationId === convId &&
      hydratedIdsRef.current.entryId === entryId
    ) {
      return;
    }
    hydratedIdsRef.current = { conversationId: convId, entryId };
    hydrateForm(entry, conversation);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guarded by hydratedIdsRef; solo conv/entry id
  }, [conversation.id, entry, entry?.id, hydrateForm]);

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return JSON.stringify(form) !== savedSnapshot;
  }, [form, savedSnapshot]);

  // Citas del usuario vinculado
  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setAppointments([]);
      return;
    }
    let cancelled = false;
    setAptsLoading(true);
    (async () => {
      try {
        const asClient = await AppointmentService.getAppointments({ clientId: uid, limit: 30 });
        const merged = [...asClient.appointments];
        if (user.isProvider) {
          const asProv = await AppointmentService.getAppointments({ providerId: uid, limit: 30 });
          const seen = new Set(merged.map((a) => a.id));
          for (const a of asProv.appointments) {
            if (!seen.has(a.id)) merged.push(a);
          }
        }
        merged.sort(
          (a, b) =>
            new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
        );
        if (!cancelled) setAppointments(merged.slice(0, 40));
      } catch {
        if (!cancelled) setAppointments([]);
      } finally {
        if (!cancelled) setAptsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isProvider]);

  useEffect(() => {
    autoSyncDoneRef.current = false;
    setSyncing(false);
  }, [conversation.id]);

  // Auto-sync: crea/actualiza la entrada de directorio una vez por conversacion.
  useEffect(() => {
    if (autoSyncDoneRef.current) return;
    if (loading) return;
    const convPhone = conversation.contactPhone || conversation.phone;
    if (!convPhone) return;

    const gen = ++syncGenRef.current;
    let cancelled = false;
    setSyncing(true);

    (async () => {
      try {
        if (!entry) {
          const existing = await directoryService.findByPhone(convPhone);
          if (existing.length > 0) {
            if (!cancelled) {
              autoSyncDoneRef.current = true;
              await refetch();
            }
            return;
          }
          const displayName =
            conversation.whatsappProfileName || conversation.contactName || convPhone;
          await directoryService.createEntry({
            fullName: displayName,
            displayName: displayName,
            phone: convPhone,
            photoUrl: conversation.contactPhotoUrl || undefined,
            source: 'WHATSAPP_INBOUND',
            channels: ['WHATSAPP'],
            status: 'active',
          });
          if (!cancelled) {
            autoSyncDoneRef.current = true;
            await refetch();
          }
          return;
        }

        const updates: Record<string, unknown> = {};
        const hasPhoneInEntry = entry.phone && entry.phone.trim().length > 0;
        if (!hasPhoneInEntry && convPhone) {
          updates.phone = convPhone;
        }

        const waName = conversation.whatsappProfileName || conversation.contactName;
        if (waName && (!entry.fullName || entry.fullName.trim().length === 0)) {
          updates.fullName = waName;
          updates.displayName = waName;
        }

        if (conversation.contactPhotoUrl && (!entry.photoUrl || entry.photoUrl.trim().length === 0)) {
          updates.photoUrl = conversation.contactPhotoUrl;
        }

        if (conversation.lastMessageAt) {
          updates.lastWhatsAppMessageAt = conversation.lastMessageAt;
        }
        if (conversation.lastMessageText) {
          updates.lastWhatsAppMessageText = conversation.lastMessageText;
        }

        if (typeof conversation.unreadCount === 'number') {
          updates.unreadWhatsAppCount = conversation.unreadCount;
        }

        if (conversation.isArchived) {
          updates.status = 'inactive';
        } else if (conversation.state === 'resolved' && entry.status === 'active') {
          updates.status = 'inactive';
        } else if ((conversation.state === 'active' || conversation.state === 'escalated') && entry.status !== 'active') {
          updates.status = 'active';
        }

        if (conversation.assignedTo && (!entry.whatsAppAssignedTo || entry.whatsAppAssignedTo.trim().length === 0)) {
          updates.whatsAppAssignedTo = conversation.assignedTo;
        }

        const keys = Object.keys(updates);
        if (keys.length > 0) {
          await directoryService.updateEntry(entry.id, updates);
          if (!cancelled) {
            autoSyncDoneRef.current = true;
            await refetch();
          }
        } else {
          autoSyncDoneRef.current = true;
        }
      } catch (e) {
        console.warn('[WhatsAppContactSidePanel] auto-sync error:', e);
        autoSyncDoneRef.current = true;
      } finally {
        if (gen === syncGenRef.current) {
          setSyncing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Auto-sync una vez por par conversación/entrada; autoSyncDoneRef evita bucles.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [conversation.id, entry?.id, loading, refetch]);

  const applyVerifiedName = useCallback(() => {
    setForm((prev) => {
      const name = prev.fullName.trim();
      if (!name) return prev;
      return { ...prev, displayName: name, whatsappProfileName: name };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!entry) return;

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      let normalizedPhone: string | undefined;
      if (form.phone.trim()) {
        const normalized = normalizeDirectoryPhoneE164(form.phone.trim());
        if (!normalized) {
          setError('Teléfono inválido. Usa formato internacional, ej. +573001234567');
          return;
        }
        normalizedPhone = normalized;
      }

      const metadata = { ...(entry.metadata ?? {}) };
      if (form.department.trim()) metadata.department = form.department.trim();
      else delete metadata.department;
      if (form.city.trim()) metadata.city = form.city.trim();
      else delete metadata.city;

      const directoryPayload: Partial<DirectoryEntry> = {
        fullName: form.fullName.trim() || '',
        displayName: form.displayName.trim() || form.fullName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: normalizedPhone,
        photoUrl: form.photoUrl.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
        qualityTag: form.qualityTag as DirectoryEntry['qualityTag'],
        status: form.status,
        source: form.source || undefined,
        channels: form.channels,
        activeSequence: form.activeSequence,
        whatsAppAssignedTo: form.whatsAppAssignedTo.trim() || undefined,
        optOut: form.optOut,
        paymentStatus: form.paymentStatus || undefined,
        otpRequired: form.otpRequired,
        preferredServiceAddressLine: form.preferredServiceAddressLine.trim() || undefined,
        preferredServiceAddressRef: form.preferredServiceAddressRef.trim() || undefined,
        appUserId: form.appUserId.trim() || undefined,
        isAppUser: form.isAppUser,
        providerId: form.providerId.trim() || undefined,
        serviceId: form.serviceId.trim() || undefined,
        internalNotes: form.internalNotes.trim() || undefined,
        metadata,
      };

      const pendingAmount = parseNum(form.pendingAmount);
      if (pendingAmount !== undefined) directoryPayload.pendingAmount = pendingAmount;
      const pendingAppointmentsCount = parseNum(form.pendingAppointmentsCount);
      if (pendingAppointmentsCount !== undefined) {
        directoryPayload.pendingAppointmentsCount = pendingAppointmentsCount;
      }
      const lastChargedAmount = parseNum(form.lastChargedAmount);
      if (lastChargedAmount !== undefined) directoryPayload.lastChargedAmount = lastChargedAmount;

      await directoryService.updateEntry(entry.id, directoryPayload);

      const contactName = (form.displayName.trim() || form.fullName.trim());
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: {
          contactName: contactName.length >= 2 ? contactName : undefined,
          contactPhotoUrl: form.photoUrl.trim() || null,
          whatsappProfileName: form.whatsappProfileName.trim() || null,
          adminNotes: form.adminNotes.trim() || null,
          // Bloquea el nombre frente a futuros mensajes entrantes de WhatsApp.
          contactNameLocked: contactName.length >= 2 ? true : undefined,
        },
      });

      // Write-back al usuario de la App (Firestore users/{uid}) cuando aplique.
      const appUid = form.appUserId.trim() || entry.appUserId;
      if (appUid) {
        try {
          await updateAppUserProfile({
            uid: appUid,
            name: form.fullName.trim() || form.displayName.trim() || undefined,
            email: form.email.trim() || undefined,
            photoUrl: form.photoUrl.trim() || undefined,
          });
        } catch (e) {
          console.warn('[WhatsAppContactSidePanel] write-back Firebase error:', e);
          setError(
            'Directorio y WhatsApp actualizados, pero no se pudo escribir en el usuario de la App: ' +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      }

      const savedForm: FormState = {
        ...form,
        phone: normalizedPhone ?? form.phone,
      };
      setForm(savedForm);
      setSavedSnapshot(JSON.stringify(savedForm));
      setSaveSuccess(true);
      await refetch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar la ficha');
    } finally {
      setSaving(false);
    }
  }, [conversation.id, entry, form, refetch]);

  const hasLinkedAppUser = Boolean(user?.id || entry?.appUserId || form.appUserId.trim());

  return (
    <Box
      sx={{
        width: 360,
        minWidth: 300,
        maxWidth: 400,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Ficha cliente
        </Typography>
        {conversation.whatsappProfileName && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Perfil WA: {conversation.whatsappProfileName}
          </Typography>
        )}
        {conversation.contactPhone && (
          <Typography variant="caption" color="text.secondary" display="block">
            {conversation.contactPhone}
          </Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {saveSuccess && (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSaveSuccess(false)}>
            Cambios guardados
          </Alert>
        )}

        {entry ? (
          <>
            {hasLinkedAppUser && (
              <Chip
                label="Usuario app vinculado"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ mb: 1.5 }}
              />
            )}

            {/* === Perfil WhatsApp / override === */}
            <SectionTitle>Perfil WhatsApp</SectionTitle>
            <Stack spacing={1}>
              <TextField
                label="Nombre de perfil WhatsApp"
                size="small"
                value={form.whatsappProfileName}
                onChange={(e) => setField('whatsappProfileName', e.target.value)}
                fullWidth
                helperText="Se sobrescribe el nombre mostrado del contacto"
              />
              <Button size="small" variant="outlined" onClick={applyVerifiedName} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
                Aplicar nombre verificado
              </Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* === Identidad === */}
            <SectionTitle>Identidad</SectionTitle>
            <Stack spacing={1}>
              <TextField
                label="Nombre completo"
                size="small"
                value={form.fullName}
                onChange={(e) => setField('fullName', e.target.value)}
                fullWidth
              />
              <TextField
                label="Nombre a mostrar"
                size="small"
                value={form.displayName}
                onChange={(e) => setField('displayName', e.target.value)}
                fullWidth
              />
              <TextField
                label="Teléfono"
                size="small"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                fullWidth
                placeholder="+573001234567"
                helperText="Formato internacional, ej. +573001234567"
              />
              <TextField
                label="Email"
                size="small"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                fullWidth
              />
              <TextField
                label="Foto URL"
                size="small"
                value={form.photoUrl}
                onChange={(e) => setField('photoUrl', e.target.value)}
                fullWidth
              />
              <TextField
                label="Bio / Notas"
                size="small"
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
              <TextField
                label="Departamento"
                size="small"
                value={form.department}
                onChange={(e) => setField('department', e.target.value)}
                fullWidth
              />
              <TextField
                label="Ciudad"
                size="small"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                fullWidth
              />
              <TextField
                label="Dirección"
                size="small"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* === Clasificación CRM === */}
            <SectionTitle>Clasificación CRM</SectionTitle>
            <Stack spacing={1}>
              {form.tags.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, lineHeight: '24px' }}>
                    Tags:
                  </Typography>
                  {form.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" color={tag === 'VIP' ? 'warning' : 'default'} />
                  ))}
                </Stack>
              )}
              {entry && (
                <DirectoryClassificationTagPicker
                  entry={entry}
                  autoSave
                  onSaved={(updated) => {
                    setField('classification', updated.classification);
                    setField('tags', updated.tags ?? []);
                  }}
                />
              )}
              <FormControl size="small" fullWidth>
                <InputLabel>Calidad</InputLabel>
                <Select
                  label="Calidad"
                  value={form.qualityTag}
                  onChange={(e) => setField('qualityTag', e.target.value)}
                >
                  {QUALITY_TAGS.map((q) => (
                    <MenuItem key={q} value={q}>
                      {q}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Estado</InputLabel>
                <Select
                  label="Estado"
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                >
                  {ENTRY_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Fuente</InputLabel>
                <Select
                  label="Fuente"
                  value={form.source}
                  onChange={(e) => setField('source', e.target.value)}
                >
                  {SOURCES.map((s) => (
                    <MenuItem key={s || 'none'} value={s}>
                      {s || '—'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Canales</InputLabel>
                <Select
                  label="Canales"
                  multiple
                  value={form.channels}
                  onChange={(e) =>
                    setField(
                      'channels',
                      (typeof e.target.value === 'string'
                        ? e.target.value.split(',')
                        : e.target.value) as DirectoryChannel[],
                    )
                  }
                  renderValue={(selected) => (selected as string[]).join(', ')}
                >
                  {CHANNEL_OPTIONS.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Secuencia</InputLabel>
                <Select
                  label="Secuencia"
                  value={form.activeSequence}
                  onChange={(e) => setField('activeSequence', e.target.value)}
                >
                  {SEQUENCES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Asignado a (WhatsApp)"
                size="small"
                value={form.whatsAppAssignedTo}
                onChange={(e) => setField('whatsAppAssignedTo', e.target.value)}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={form.optOut}
                    onChange={(e) => setField('optOut', e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Opt-out (no contactar)</Typography>}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* === Facturación / servicio === */}
            <SectionTitle>Facturación y servicio</SectionTitle>
            <Stack spacing={1}>
              <FormControl size="small" fullWidth>
                <InputLabel>Estado de pago</InputLabel>
                <Select
                  label="Estado de pago"
                  value={form.paymentStatus}
                  onChange={(e) => setField('paymentStatus', e.target.value)}
                >
                  {PAYMENT_STATUSES.map((p) => (
                    <MenuItem key={p || 'none'} value={p}>
                      {p || '—'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Monto pendiente"
                size="small"
                type="number"
                value={form.pendingAmount}
                onChange={(e) => setField('pendingAmount', e.target.value)}
                fullWidth
              />
              <TextField
                label="Citas pendientes"
                size="small"
                type="number"
                value={form.pendingAppointmentsCount}
                onChange={(e) => setField('pendingAppointmentsCount', e.target.value)}
                fullWidth
              />
              <TextField
                label="Último monto cobrado"
                size="small"
                type="number"
                value={form.lastChargedAmount}
                onChange={(e) => setField('lastChargedAmount', e.target.value)}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={form.otpRequired}
                    onChange={(e) => setField('otpRequired', e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Requiere OTP</Typography>}
              />
              <TextField
                label="Dirección de servicio preferida"
                size="small"
                value={form.preferredServiceAddressLine}
                onChange={(e) => setField('preferredServiceAddressLine', e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
              <TextField
                label="Ref. dirección de servicio"
                size="small"
                value={form.preferredServiceAddressRef}
                onChange={(e) => setField('preferredServiceAddressRef', e.target.value)}
                fullWidth
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* === Vínculos === */}
            <SectionTitle>Vínculos</SectionTitle>
            <Stack spacing={1}>
              <TextField
                label="App user ID (Firebase uid)"
                size="small"
                value={form.appUserId}
                onChange={(e) => setField('appUserId', e.target.value)}
                fullWidth
                helperText="Si está presente, el nombre/email/foto se escriben en users/{uid}"
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={form.isAppUser}
                    onChange={(e) => setField('isAppUser', e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Es usuario de la App</Typography>}
              />
              <TextField
                label="Provider ID"
                size="small"
                value={form.providerId}
                onChange={(e) => setField('providerId', e.target.value)}
                fullWidth
              />
              <TextField
                label="Service ID"
                size="small"
                value={form.serviceId}
                onChange={(e) => setField('serviceId', e.target.value)}
                fullWidth
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* === Notas internas === */}
            <SectionTitle>Notas internas</SectionTitle>
            <Stack spacing={1}>
              <TextField
                label="Notas internas (directorio)"
                size="small"
                value={form.internalNotes}
                onChange={(e) => setField('internalNotes', e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
              <TextField
                label="Notas de la conversación"
                size="small"
                value={form.adminNotes}
                onChange={(e) => setField('adminNotes', e.target.value)}
                fullWidth
                multiline
                minRows={2}
                placeholder="Visibles solo en panel (admin)"
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* === Auditoría (solo lectura) === */}
            <SectionTitle>Auditoría</SectionTitle>
            <Stack spacing={0.5} sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1, mb: 2 }}>
              <ReadOnlyRow label="ID directorio" value={entry.id} />
              <ReadOnlyRow label="Creado" value={formatDate(entry.createdAt)} />
              <ReadOnlyRow label="Actualizado" value={formatDate(entry.updatedAt)} />
              <ReadOnlyRow label="Última sincronización" value={formatDate(entry.lastSyncedAt)} />
              <ReadOnlyRow label="Primer contacto" value={formatDate(entry.firstContactAt)} />
              <ReadOnlyRow label="Último contacto" value={formatDate(entry.lastContactAt)} />
              <ReadOnlyRow label="Mensajes" value={entry.messagesCount} />
              <ReadOnlyRow label="No leídos WA" value={entry.unreadWhatsAppCount} />
              <ReadOnlyRow label="Paso de secuencia" value={entry.sequenceStep} />
              <ReadOnlyRow label="Último msg WA" value={formatDate(entry.lastWhatsAppMessageAt)} />
              {entry.lastWhatsAppMessageText && (
                <ReadOnlyRow
                  label="Texto último WA"
                  value={
                    entry.lastWhatsAppMessageText.length > 60
                      ? `${entry.lastWhatsAppMessageText.slice(0, 60)}…`
                      : entry.lastWhatsAppMessageText
                  }
                />
              )}
              {entry.lastWhatsAppIntent && (
                <ReadOnlyRow label="Intent WA" value={entry.lastWhatsAppIntent} />
              )}
              {entry.lastResponseText && (
                <ReadOnlyRow
                  label="Última respuesta"
                  value={
                    entry.lastResponseText.length > 60
                      ? `${entry.lastResponseText.slice(0, 60)}…`
                      : entry.lastResponseText
                  }
                />
              )}
              {entry.lastResponseAt && (
                <ReadOnlyRow label="Hora respuesta" value={formatDate(entry.lastResponseAt)} />
              )}
              {entry.appointmentId && (
                <ReadOnlyRow label="Cita vinculada" value={entry.appointmentId} />
              )}
              {entry.whatsAppConversationId && (
                <ReadOnlyRow label="Conversación WA" value={entry.whatsAppConversationId} />
              )}
            </Stack>

            <Button
              variant="contained"
              fullWidth
              disabled={!isDirty || saving}
              onClick={() => void handleSave()}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </>
        ) : syncing ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
            <CircularProgress size={24} />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              Creando entrada en directorio…
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No hay entrada en el directorio para este teléfono.
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Citas recientes
          </Typography>
          <MuiLink component={Link} to="/calendar" variant="caption" underline="hover">
            Abrir calendario
          </MuiLink>
        </Stack>
        {!user?.id ? (
          <Typography variant="body2" color="text.secondary">
            Vincula un usuario para ver citas.
          </Typography>
        ) : aptsLoading ? (
          <CircularProgress size={24} />
        ) : appointments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Sin citas para este usuario.
          </Typography>
        ) : (
          <Table size="small" sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Servicio</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Rol</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {appointments.map((apt) => (
                <TableRow key={apt.id}>
                  <TableCell sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {new Date(apt.scheduledDate).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: '0.75rem',
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={apt.serviceTitle}
                  >
                    {apt.serviceTitle}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>
                    <Chip label={statusLabel(apt.status)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>
                    {user ? appointmentRole(apt, user.id) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    </Box>
  );
};

export default WhatsAppContactSidePanel;
