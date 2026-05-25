import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
import { leadService } from '@/services/leadService';
import { AppointmentService } from '@/services/appointmentService';
import type { Appointment } from '@/types/appointment';
import type { LeadSequenceType, LeadStatus } from '@/types/lead';
import type { User } from '@/types';

const UserDetailsDialog = React.lazy(() => import('../common/UserDetailsDialog'));

const LEAD_STATUSES: LeadStatus[] = [
  'PENDIENTE',
  'NO_AGENDO',
  'AGENDADO',
  'COMPLETADO',
  'OPT_OUT',
];

const SEQUENCES: LeadSequenceType[] = ['NINGUNA', 'SEGUIMIENTO', 'REBOOKING'];

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
  const { user, lead, refetch, loading } = contact;

  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userPhotoUrl, setUserPhotoUrl] = useState('');
  const [userBio, setUserBio] = useState('');
  const [userDept, setUserDept] = useState('');
  const [userCity, setUserCity] = useState('');
  const [userAddress, setUserAddress] = useState('');

  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('PENDIENTE');
  const [leadSeq, setLeadSeq] = useState<LeadSequenceType>('NINGUNA');
  const [leadAddress, setLeadAddress] = useState('');
  const [leadNotes, setLeadNotes] = useState('');

  const [adminNotes, setAdminNotes] = useState(conversation.adminNotes || '');

  const [savingUser, setSavingUser] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

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
    if (lead) {
      setLeadName(lead.name || '');
      setLeadEmail(lead.email || '');
      setLeadStatus(lead.status);
      setLeadSeq(lead.secuencia_activa);
      setLeadAddress(lead.address || '');
      setLeadNotes(lead.notes || '');
    } else {
      setLeadName('');
      setLeadEmail('');
      setLeadStatus('PENDIENTE');
      setLeadSeq('NINGUNA');
      setLeadAddress('');
      setLeadNotes('');
    }
  }, [lead]);

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
        let merged = [...asClient.appointments];
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

  const handleSaveLead = async () => {
    if (!lead) return;
    setError(null);
    setOkMsg(null);
    setSavingLead(true);
    try {
      await leadService.updateLead(lead.id, {
        name: leadName.trim() || undefined,
        email: leadEmail.trim() || undefined,
        status: leadStatus,
        secuencia_activa: leadSeq,
        address: leadAddress.trim() || undefined,
        notes: leadNotes.trim() || undefined,
      });
      const canonical = leadName.trim();
      if (canonical.length >= 2) await syncConversationName(canonical);
      setOkMsg('Lead actualizado');
      await refetch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar lead');
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
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" fontWeight={600}>
            Ficha cliente
          </Typography>
          {canShowTemplates && (
            <Button size="small" onClick={onBackToTemplates} sx={{ textTransform: 'none' }}>
              Plantillas
            </Button>
          )}
        </Stack>
        {conversation.whatsappProfileName && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Perfil WA: {conversation.whatsappProfileName}
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

        {lead ? (
          <>
            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
              Lead
            </Typography>
            <Stack spacing={1}>
              <TextField label="Nombre" size="small" value={leadName} onChange={(e) => setLeadName(e.target.value)} fullWidth />
              <TextField label="Email" size="small" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} fullWidth />
              <FormControl size="small" fullWidth>
                <InputLabel>Estado</InputLabel>
                <Select
                  label="Estado"
                  value={leadStatus}
                  onChange={(e) => setLeadStatus(e.target.value as LeadStatus)}
                >
                  {LEAD_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Secuencia</InputLabel>
                <Select
                  label="Secuencia"
                  value={leadSeq}
                  onChange={(e) => setLeadSeq(e.target.value as LeadSequenceType)}
                >
                  {SEQUENCES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField label="Dirección" size="small" value={leadAddress} onChange={(e) => setLeadAddress(e.target.value)} fullWidth />
              <TextField label="Notas lead" size="small" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} fullWidth multiline minRows={2} />
              <Button variant="contained" size="small" color="secondary" disabled={savingLead} onClick={() => void handleSaveLead()} sx={{ textTransform: 'none' }}>
                {savingLead ? 'Guardando…' : 'Guardar lead'}
              </Button>
            </Stack>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No hay lead en Firestore para este teléfono.
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
