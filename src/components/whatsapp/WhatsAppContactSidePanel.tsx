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
import { updateUserProfileViaFunction } from '@/services/cloudFunctions';
import { directoryService } from '@/services/directoryService';
import { AppointmentService } from '@/services/appointmentService';
import type { Appointment } from '@/types/appointment';
import type { DirectoryEntry } from '@/types/lead';
import type { User } from '@/types';

const UserDetailsDialog = React.lazy(() => import('../common/UserDetailsDialog'));

const ENTRY_STATUSES = ['active', 'inactive', 'opt_out'];
const SEQUENCES = ['NINGUNA', 'SEGUIMIENTO', 'REBOOKING'];

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
  canShowTemplates: boolean;
  onBackToTemplates: () => void;
}

const WhatsAppContactSidePanel: React.FC<WhatsAppContactSidePanelProps> = ({
  conversation,
  contact,
  canShowTemplates,
  onBackToTemplates,
}) => {
  const { user, directoryEntry, lead, refetch, loading } = contact;
  // Use directoryEntry as primary, fall back to lead for backward compat
  const entry: DirectoryEntry | null = directoryEntry ?? lead;

  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userPhotoUrl, setUserPhotoUrl] = useState('');
  const [userBio, setUserBio] = useState('');
  const [userDept, setUserDept] = useState('');
  const [userCity, setUserCity] = useState('');
  const [userAddress, setUserAddress] = useState('');

  const [entryFullName, setEntryFullName] = useState('');
  const [entryEmail, setEntryEmail] = useState('');
  const [entryPhone, setEntryPhone] = useState('');
  const [entryStatus, setEntryStatus] = useState('active');
  const [entryClassification, setEntryClassification] = useState('unknown');
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [entryAssignedTo, setEntryAssignedTo] = useState('');
  const [entrySeq, setEntrySeq] = useState('NINGUNA');
  const [entryAddress, setEntryAddress] = useState('');
  const [entryNotes, setEntryNotes] = useState('');

  const [adminNotes, setAdminNotes] = useState(conversation.adminNotes || '');

  const [savingUser, setSavingUser] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const autoSyncDoneRef = useRef(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [aptsLoading, setAptsLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setAdminNotes(conversation.adminNotes || '');
  }, [conversation.id, conversation.adminNotes]);

  useEffect(() => {
    if (user) {
      setUserName(user.name || '');
      const pn = (user.phoneNumber || '').trim();
      setUserPhone(pn ? (pn.startsWith('+') ? pn : `+${pn.replace(/^\+/, '')}`) : '');
      setUserPhotoUrl(user.photoUrl || '');
      setUserBio(user.bio || '');
      setUserDept(user.department || '');
      setUserCity(user.city || '');
      setUserAddress(user.address || '');
    } else {
      setUserName('');
      setUserPhone('');
      setUserPhotoUrl('');
      setUserBio('');
      setUserDept('');
      setUserCity('');
      setUserAddress('');
    }
  }, [user]);

  useEffect(() => {
    if (entry) {
      setEntryFullName(entry.fullName || '');
      setEntryEmail(entry.email || '');
      setEntryPhone(entry.phone || '');
      setEntryStatus(entry.status || 'active');
      setEntryClassification(entry.classification || 'unknown');
      setEntryTags(entry.tags || []);
      setEntryAssignedTo(entry.whatsAppAssignedTo || '');
      setEntrySeq(entry.activeSequence || 'NINGUNA');
      setEntryAddress(entry.address || '');
      setEntryNotes(entry.notes || '');
    } else {
      setEntryFullName('');
      setEntryEmail('');
      setEntryPhone('');
      setEntryStatus('active');
      setEntryClassification('unknown');
      setEntryTags([]);
      setEntryAssignedTo('');
      setEntrySeq('NINGUNA');
      setEntryAddress('');
      setEntryNotes('');
    }
  }, [entry]);

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

  // ── Generación: controla que solo el último auto-sync marque syncing=false ──
  const syncGenRef = useRef(0);

  // ── Resetear flag cuando cambia la conversación ──
  useEffect(() => {
    autoSyncDoneRef.current = false;
  }, [conversation.id]);

  // ── Auto-sync: persiste datos WA → directory cuando se abre la conversación ──
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
          // No existe entry → crear uno automáticamente con datos de la conversación
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
          // Refetch para cargar el entry recién creado
          if (!cancelled) {
            autoSyncDoneRef.current = true;
            await refetch();
          }
          return;
        }

        // Entry existe → auto-rellenar campos vacíos desde la conversación
        const updates: Record<string, unknown> = {};

        // Teléfono: si la conversación tiene teléfono y el entry no
        const hasPhoneInEntry = entry.phone && entry.phone.trim().length > 0;
        if (!hasPhoneInEntry && convPhone) {
          updates.phone = convPhone;
        }

        // Nombre: si la conversación tiene nombre WA mejor y el entry no tiene nombre
        const waName = conversation.whatsappProfileName || conversation.contactName;
        if (waName && (!entry.fullName || entry.fullName.trim().length === 0)) {
          updates.fullName = waName;
          updates.displayName = waName;
        }

        // Foto: si la conversación tiene foto y el entry no
        if (conversation.contactPhotoUrl && (!entry.photoUrl || entry.photoUrl.trim().length === 0)) {
          updates.photoUrl = conversation.contactPhotoUrl;
        }

        // Último mensaje: siempre actualizar
        if (conversation.lastMessageAt) {
          updates.lastWhatsAppMessageAt = conversation.lastMessageAt;
        }
        if (conversation.lastMessageText) {
          updates.lastWhatsAppMessageText = conversation.lastMessageText;
        }

        // No leídos
        if (typeof conversation.unreadCount === 'number') {
          updates.unreadWhatsAppCount = conversation.unreadCount;
        }

        // Estado: si la conversación está archivada o resuelta → inactive
        if (conversation.isArchived) {
          updates.status = 'inactive';
        } else if (conversation.state === 'resolved' && entry.status === 'active') {
          updates.status = 'inactive';
        } else if ((conversation.state === 'active' || conversation.state === 'escalated') && entry.status !== 'active') {
          updates.status = 'active';
        }

        // Asignado a: si la conversación tiene operador asignado y el entry no
        if (conversation.assignedTo && (!entry.whatsAppAssignedTo || entry.whatsAppAssignedTo.trim().length === 0)) {
          updates.whatsAppAssignedTo = conversation.assignedTo;
        }

        // Si hay cambios, guardar y recargar
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
        autoSyncDoneRef.current = true; // No reintentar en cada re-render
      } finally {
        // Solo la generación más reciente puede desactivar el spinner
        if (!cancelled && gen === syncGenRef.current) {
          setSyncing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversation.id, entry, loading, refetch]);

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

  const syncConversationName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length >= 2) {
        await patchWhatsAppConversationAdmin({
          conversationId: conversation.id,
          patch: { contactName: trimmed },
        });
      }
    },
    [conversation.id],
  );

  const handleSaveUser = async () => {
    if (!user) return;
    setError(null);
    setOkMsg(null);
    setSavingUser(true);
    try {
      const payload: Record<string, string> = {};
      if (userName.trim()) payload.name = userName.trim();
      if (userPhone.trim()) {
        const p = userPhone.trim().startsWith('+') ? userPhone.trim() : `+${userPhone.trim().replace(/^\+/, '')}`;
        payload.phoneNumber = p;
      }
      if (userPhotoUrl.trim()) payload.photoUrl = userPhotoUrl.trim();
      if (userBio.trim()) payload.bio = userBio.trim();
      if (userDept.trim()) payload.department = userDept.trim();
      if (userCity.trim()) payload.city = userCity.trim();
      if (userAddress.trim()) payload.address = userAddress.trim();

      if (Object.keys(payload).length === 0) {
        setOkMsg('Sin cambios para guardar');
        return;
      }

      await updateUserProfileViaFunction(payload, user.id);
      if (userName.trim().length >= 2) {
        await syncConversationName(userName.trim());
      }
      if (userPhotoUrl.trim()) {
        await patchWhatsAppConversationAdmin({
          conversationId: conversation.id,
          patch: { contactPhotoUrl: userPhotoUrl.trim() },
        });
      }
      setOkMsg('Usuario actualizado');
      await refetch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar usuario');
    } finally {
      setSavingUser(false);
    }
  };

  const handleSaveEntry = async () => {
    if (!entry) return;
    setError(null);
    setOkMsg(null);
    setSavingLead(true);
    try {
      await directoryService.updateEntry(entry.id, {
        fullName: entryFullName.trim() || '',
        email: entryEmail.trim() || undefined,
        phone: entryPhone.trim() || undefined,
        status: entryStatus,
        classification: entryClassification as DirectoryEntry['classification'],
        tags: entryTags,
        whatsAppAssignedTo: entryAssignedTo.trim() || undefined,
        activeSequence: entrySeq,
        address: entryAddress.trim() || undefined,
        notes: entryNotes.trim() || undefined,
      });
      const canonical = entryFullName.trim();
      if (canonical.length >= 2) await syncConversationName(canonical);
      setOkMsg('Entrada actualizada');
      await refetch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar entrada');
    } finally {
      setSavingLead(false);
    }
  };

  const handleSaveNotes = async () => {
    setError(null);
    setOkMsg(null);
    setSavingNotes(true);
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { adminNotes: adminNotes.trim() || null },
      });
      setOkMsg('Notas guardadas');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar notas');
    } finally {
      setSavingNotes(false);
    }
  };

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
        {okMsg && (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setOkMsg(null)}>
            {okMsg}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" fontWeight={600}>
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
          sx={{ mt: 0.5, mb: 1, bgcolor: 'background.paper' }}
        />
        <Button
          variant="outlined"
          size="small"
          disabled={savingNotes}
          onClick={() => void handleSaveNotes()}
          sx={{ mb: 2, textTransform: 'none' }}
        >
          {savingNotes ? 'Guardando…' : 'Guardar notas'}
        </Button>

        <Divider sx={{ my: 1 }} />

        {user ? (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Usuario vinculado
              </Typography>
              <Button size="small" onClick={() => setDialogOpen(true)} sx={{ textTransform: 'none' }}>
                Ficha completa
              </Button>
            </Stack>
            <Stack spacing={1}>
              <TextField label="Nombre" size="small" value={userName} onChange={(e) => setUserName(e.target.value)} fullWidth />
              <TextField
                label="Teléfono (+57…)"
                size="small"
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                fullWidth
              />
              <TextField label="Foto URL" size="small" value={userPhotoUrl} onChange={(e) => setUserPhotoUrl(e.target.value)} fullWidth />
              <TextField label="Bio" size="small" value={userBio} onChange={(e) => setUserBio(e.target.value)} fullWidth multiline minRows={2} />
              <TextField label="Departamento" size="small" value={userDept} onChange={(e) => setUserDept(e.target.value)} fullWidth />
              <TextField label="Ciudad" size="small" value={userCity} onChange={(e) => setUserCity(e.target.value)} fullWidth />
              <TextField label="Dirección" size="small" value={userAddress} onChange={(e) => setUserAddress(e.target.value)} fullWidth multiline minRows={2} />
              <Button variant="contained" size="small" disabled={savingUser} onClick={() => void handleSaveUser()} sx={{ textTransform: 'none' }}>
                {savingUser ? 'Guardando…' : 'Guardar usuario'}
              </Button>
            </Stack>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sin usuario de app vinculado a este chat.
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {entry ? (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Directorio
              </Typography>
              {syncing && <CircularProgress size={14} sx={{ ml: 1 }} />}
            </Stack>
            <Stack spacing={1}>
              <TextField label="Nombre" size="small" value={entryFullName} onChange={(e) => setEntryFullName(e.target.value)} fullWidth />
              <TextField label="Teléfono" size="small" value={entryPhone} onChange={(e) => setEntryPhone(e.target.value)} fullWidth />
              <TextField label="Email" size="small" value={entryEmail} onChange={(e) => setEntryEmail(e.target.value)} fullWidth />
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
              <TextField label="Asignado a (WhatsApp)" size="small" value={entryAssignedTo} onChange={(e) => setEntryAssignedTo(e.target.value)} fullWidth />
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
              <TextField label="Dirección" size="small" value={entryAddress} onChange={(e) => setEntryAddress(e.target.value)} fullWidth />
              <TextField label="Notas" size="small" value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} fullWidth multiline minRows={2} />

              {/* Info de WhatsApp (solo lectura) */}
              {(entry.lastWhatsAppMessageText || entry.lastWhatsAppMessageAt || entry.whatsAppAssignedTo) && (
                <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                    Última actividad WhatsApp
                  </Typography>
                  {entry.lastWhatsAppMessageText && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                      <strong>Msg:</strong> {entry.lastWhatsAppMessageText.length > 80
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

              <Button variant="contained" size="small" color="secondary" disabled={savingLead || syncing} onClick={() => void handleSaveEntry()} sx={{ textTransform: 'none' }}>
                {savingLead ? 'Guardando…' : 'Guardar'}
              </Button>
            </Stack>
          </>
        ) : syncing ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
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
