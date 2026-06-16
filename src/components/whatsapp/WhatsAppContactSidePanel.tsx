import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Select,
  Stack,
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
import { patchWhatsAppConversationAdmin } from '@/services/whatsappService';
import type { WhatsAppContactContextValue } from '@/hooks/useWhatsAppContactContext';
import { directoryService } from '@/services/directoryService';
import { AppointmentService } from '@/services/appointmentService';
import type { Appointment } from '@/types/appointment';
import type { DirectoryEntry } from '@/types/lead';
import type { User } from '@/types';
import { normalizeDirectoryPhoneE164 } from '@/utils/directoryPhone';

const UserDetailsDialog = React.lazy(() => import('../common/UserDetailsDialog'));

const ENTRY_STATUSES = ['active', 'inactive', 'opt_out'];
const SEQUENCES = ['NINGUNA', 'SEGUIMIENTO', 'REBOOKING'];
const CRM_AUTO_SAVE_MS = 800;

type ContactDraftSnapshot = {
  fullName: string;
  email: string;
  phone: string;
  photoUrl: string;
  notes: string;
  department: string;
  city: string;
  address: string;
  adminNotes: string;
};

type CrmDraftSnapshot = {
  status: string;
  classification: string;
  assignedTo: string;
  sequence: string;
};

function contactDraftKey(snapshot: ContactDraftSnapshot): string {
  return JSON.stringify(snapshot);
}

function crmDraftKey(snapshot: CrmDraftSnapshot): string {
  return JSON.stringify(snapshot);
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone?.trim()) return '';
  return normalizeDirectoryPhoneE164(phone) ?? phone.trim();
}

function contactDraftFromSources(
  entry: DirectoryEntry | null,
  conversation: WhatsAppConversation,
): ContactDraftSnapshot {
  const metadata = entry?.metadata ?? {};
  return {
    fullName: (entry?.fullName || '').trim(),
    email: (entry?.email || '').trim(),
    phone: formatPhoneDisplay(entry?.phone),
    photoUrl: (entry?.photoUrl || '').trim(),
    notes: (entry?.notes || '').trim(),
    department: typeof metadata.department === 'string' ? metadata.department.trim() : '',
    city: typeof metadata.city === 'string' ? metadata.city.trim() : '',
    address: (entry?.address || '').trim(),
    adminNotes: (conversation.adminNotes || '').trim(),
  };
}

function crmDraftFromEntry(entry: DirectoryEntry): CrmDraftSnapshot {
  return {
    status: entry.status || 'active',
    classification: entry.classification || 'unknown',
    assignedTo: (entry.whatsAppAssignedTo || '').trim(),
    sequence: entry.activeSequence || 'NINGUNA',
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

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const [entryStatus, setEntryStatus] = useState('active');
  const [entryClassification, setEntryClassification] = useState('unknown');
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [entryAssignedTo, setEntryAssignedTo] = useState('');
  const [entrySeq, setEntrySeq] = useState('NINGUNA');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSyncDoneRef = useRef(false);
  const hydratedIdsRef = useRef<{ conversationId: string; entryId: string | null }>({
    conversationId: '',
    entryId: null,
  });
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const lastPersistedCrmKeyRef = useRef<string | null>(null);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [aptsLoading, setAptsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const currentContactDraft = useCallback((): ContactDraftSnapshot => ({
    fullName: fullName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    photoUrl: photoUrl.trim(),
    notes: notes.trim(),
    department: department.trim(),
    city: city.trim(),
    address: address.trim(),
    adminNotes: adminNotes.trim(),
  }), [address, adminNotes, city, department, email, fullName, notes, phone, photoUrl]);

  const currentCrmDraft = useCallback((): CrmDraftSnapshot => ({
    status: entryStatus,
    classification: entryClassification,
    assignedTo: entryAssignedTo.trim(),
    sequence: entrySeq,
  }), [entryAssignedTo, entryClassification, entrySeq, entryStatus]);

  const isDirty = useMemo(() => {
    if (!lastSavedSnapshot) return false;
    return contactDraftKey(currentContactDraft()) !== lastSavedSnapshot;
  }, [currentContactDraft, lastSavedSnapshot]);

  const hydrateForm = useCallback(
    (targetEntry: DirectoryEntry | null, conv: WhatsAppConversation) => {
      const contactSnapshot = contactDraftFromSources(targetEntry, conv);
      setFullName(contactSnapshot.fullName);
      setEmail(contactSnapshot.email);
      setPhone(contactSnapshot.phone);
      setPhotoUrl(contactSnapshot.photoUrl);
      setNotes(contactSnapshot.notes);
      setDepartment(contactSnapshot.department);
      setCity(contactSnapshot.city);
      setAddress(contactSnapshot.address);
      setAdminNotes(contactSnapshot.adminNotes);
      setLastSavedSnapshot(contactDraftKey(contactSnapshot));

      if (targetEntry) {
        const crmSnapshot = crmDraftFromEntry(targetEntry);
        setEntryStatus(crmSnapshot.status);
        setEntryClassification(crmSnapshot.classification);
        setEntryAssignedTo(crmSnapshot.assignedTo);
        setEntrySeq(crmSnapshot.sequence);
        setEntryTags(targetEntry.tags || []);
        lastPersistedCrmKeyRef.current = crmDraftKey(crmSnapshot);
      } else {
        setEntryStatus('active');
        setEntryClassification('unknown');
        setEntryAssignedTo('');
        setEntrySeq('NINGUNA');
        setEntryTags([]);
        lastPersistedCrmKeyRef.current = null;
      }
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

  const syncGenRef = useRef(0);

  useEffect(() => {
    autoSyncDoneRef.current = false;
    setSyncing(false);
  }, [conversation.id]);

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
          const displayName = conversation.whatsappProfileName || conversation.contactName || convPhone;
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

  const dialogUser: User | null = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email || '—',
      name: user.name,
      photoUrl: user.photoUrl,
      phoneNumber: user.phoneNumber,
    } as User;
  }, [user]);

  const handleSaveContact = useCallback(async () => {
    if (!entry) return;

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const draft = currentContactDraft();
      let normalizedPhone: string | undefined;

      if (draft.phone) {
        const normalized = normalizeDirectoryPhoneE164(draft.phone);
        if (!normalized) {
          setError('Teléfono inválido. Usa formato internacional, ej. +573001234567');
          return;
        }
        normalizedPhone = normalized;
      }

      const metadata = { ...(entry.metadata ?? {}) };
      if (draft.department) metadata.department = draft.department;
      else delete metadata.department;
      if (draft.city) metadata.city = draft.city;
      else delete metadata.city;

      await directoryService.updateEntry(entry.id, {
        fullName: draft.fullName || '',
        displayName: draft.fullName || undefined,
        email: draft.email || undefined,
        phone: normalizedPhone,
        photoUrl: draft.photoUrl || undefined,
        address: draft.address || undefined,
        notes: draft.notes || undefined,
        metadata,
      });

      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: {
          contactName: draft.fullName.length >= 2 ? draft.fullName : undefined,
          contactPhotoUrl: draft.photoUrl || null,
          adminNotes: draft.adminNotes || null,
        },
      });

      const savedDraft: ContactDraftSnapshot = {
        ...draft,
        phone: normalizedPhone ?? draft.phone,
      };
      setLastSavedSnapshot(contactDraftKey(savedDraft));
      if (normalizedPhone) setPhone(normalizedPhone);
      setSaveSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar contacto');
    } finally {
      setSaving(false);
    }
  }, [conversation.id, currentContactDraft, entry]);

  const persistCrmFields = useCallback(async () => {
    if (!entry) return;

    const draft = currentCrmDraft();
    const draftKey = crmDraftKey(draft);
    if (draftKey === lastPersistedCrmKeyRef.current) return;

    try {
      await directoryService.updateEntry(entry.id, {
        status: draft.status,
        classification: draft.classification as DirectoryEntry['classification'],
        tags: entryTags,
        whatsAppAssignedTo: draft.assignedTo || undefined,
        activeSequence: draft.sequence,
      });
      lastPersistedCrmKeyRef.current = draftKey;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar campos CRM');
    }
  }, [currentCrmDraft, entry, entryTags]);

  useEffect(() => {
    if (!entry || loading || syncing) return;
    const timer = window.setTimeout(() => {
      void persistCrmFields();
    }, CRM_AUTO_SAVE_MS);
    return () => window.clearTimeout(timer);
  }, [
    entry,
    entryAssignedTo,
    entryClassification,
    entrySeq,
    entryStatus,
    loading,
    persistCrmFields,
    syncing,
  ]);

  const hasLinkedAppUser = Boolean(user?.id || entry?.appUserId);

  return (
    <Box
      sx={{
        width: 340,
        minWidth: 280,
        maxWidth: 380,
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
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Chip label="Usuario app vinculado" size="small" color="primary" variant="outlined" />
                {user && (
                  <Button size="small" onClick={() => setDialogOpen(true)} sx={{ textTransform: 'none' }}>
                    Ficha completa
                  </Button>
                )}
              </Stack>
            )}

            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
              Contacto
            </Typography>
            <Stack spacing={1}>
              <TextField
                label="Nombre"
                size="small"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Teléfono"
                size="small"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
                placeholder="+573001234567"
                helperText="Formato internacional, ej. +573001234567"
              />
              <TextField
                label="Email"
                size="small"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
              />
              <TextField
                label="Foto URL"
                size="small"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                fullWidth
              />
              <TextField
                label="Bio / Notas"
                size="small"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
              <TextField
                label="Departamento"
                size="small"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                fullWidth
              />
              <TextField
                label="Ciudad"
                size="small"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                fullWidth
              />
              <TextField
                label="Dirección"
                size="small"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
              CRM
            </Typography>
            <Stack spacing={1}>
              {entryTags.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, lineHeight: '24px' }}>
                    Tags:
                  </Typography>
                  {entryTags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" color={tag === 'VIP' ? 'warning' : 'default'} />
                  ))}
                </Stack>
              )}
              <TextField
                label="Clasificación"
                size="small"
                value={entryClassification}
                onChange={(e) => setEntryClassification(e.target.value)}
                fullWidth
                helperText={entryTags.length > 0 ? `Tags actuales: ${entryTags.join(', ')}` : undefined}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Estado</InputLabel>
                <Select
                  label="Estado"
                  value={entryStatus}
                  onChange={(e) => setEntryStatus(e.target.value)}
                >
                  {ENTRY_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Asignado a (WhatsApp)"
                size="small"
                value={entryAssignedTo}
                onChange={(e) => setEntryAssignedTo(e.target.value)}
                fullWidth
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Secuencia</InputLabel>
                <Select
                  label="Secuencia"
                  value={entrySeq}
                  onChange={(e) => setEntrySeq(e.target.value)}
                >
                  {SEQUENCES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {(entry.lastWhatsAppMessageText || entry.lastWhatsAppMessageAt || entry.whatsAppAssignedTo) && (
                <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                    Última actividad WhatsApp
                  </Typography>
                  {entry.lastWhatsAppMessageText && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                      <strong>Msg:</strong>{' '}
                      {entry.lastWhatsAppMessageText.length > 80
                        ? `${entry.lastWhatsAppMessageText.slice(0, 80)}…`
                        : entry.lastWhatsAppMessageText}
                    </Typography>
                  )}
                  {entry.lastWhatsAppMessageAt && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      <strong>Hora:</strong> {new Date(entry.lastWhatsAppMessageAt).toLocaleString('es-CO')}
                    </Typography>
                  )}
                  {entry.whatsAppAssignedTo && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      <strong>Asignado:</strong> {entry.whatsAppAssignedTo}
                    </Typography>
                  )}
                  {entry.unreadWhatsAppCount > 0 && (
                    <Typography variant="caption" display="block" color="error.main">
                      <strong>No leídos:</strong> {entry.unreadWhatsAppCount}
                    </Typography>
                  )}
                  {entry.source && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      <strong>Fuente:</strong> {entry.source}
                    </Typography>
                  )}
                </Box>
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
              Notas de la conversación
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Visibles solo en panel (admin)"
              sx={{ mb: 2, bgcolor: 'background.paper' }}
            />

            <Button
              variant="contained"
              fullWidth
              disabled={!isDirty || saving}
              onClick={() => void handleSaveContact()}
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

      {dialogUser && (
        <Suspense fallback={null}>
          <UserDetailsDialog open={dialogOpen} onClose={() => setDialogOpen(false)} user={dialogUser} />
        </Suspense>
      )}
    </Box>
  );
};

export default WhatsAppContactSidePanel;
