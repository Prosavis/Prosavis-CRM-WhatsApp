import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Stack,
  Grid,
  Avatar,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  FormControlLabel,
  Switch,
  Slider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import BusinessIcon from '@mui/icons-material/Business';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import StarIcon from '@mui/icons-material/Star';
import PushPinIcon from '@mui/icons-material/PushPin';
import {
  getWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  listWhatsAppSnippets,
  createWhatsAppSnippet,
  updateWhatsAppSnippet as updateSnippetSvc,
  deleteWhatsAppSnippet as deleteSnippetSvc,
  listWhatsAppTemplatePresets,
  deleteWhatsAppTemplatePreset,
  type WhatsAppBusinessProfile,
  type WhatsAppSnippet,
  type WhatsAppTemplatePreset,
} from '@/services/whatsappService';
import { getTemplateDisplayName } from '@/components/whatsapp/templates/templateDisplayNames';
import useSoundEffects from '@/hooks/useSoundEffects';
import {
  areSoundsEnabled,
  getSoundVolume,
} from '@/utils/soundPreferences';
import {
  areDesktopNotificationsEnabled,
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  setDesktopNotificationsEnabled,
} from '@/utils/desktopNotifications';

interface WhatsAppSettingsTabProps {
  phoneNumberId?: string;
}

const WhatsAppSettingsTab: React.FC<WhatsAppSettingsTabProps> = ({ phoneNumberId }) => {
  const [profile, setProfile] = useState<WhatsAppBusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [editAbout, setEditAbout] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editWebsite1, setEditWebsite1] = useState('');
  const [editWebsite2, setEditWebsite2] = useState('');

  const [snippets, setSnippets] = useState<WhatsAppSnippet[]>([]);
  const [snippetsLoading, setSnippetsLoading] = useState(true);
  const [snippetsError, setSnippetsError] = useState<string | null>(null);
  const [snippetDialog, setSnippetDialog] = useState(false);
  const [snippetEdit, setSnippetEdit] = useState<WhatsAppSnippet | null>(null);
  const [snippetShortcut, setSnippetShortcut] = useState('');
  const [snippetLabel, setSnippetLabel] = useState('');
  const [snippetBody, setSnippetBody] = useState('');
  const [snippetSaving, setSnippetSaving] = useState(false);
  const [snippetError, setSnippetError] = useState<string | null>(null);

  const [presets, setPresets] = useState<WhatsAppTemplatePreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const { setEnabled: setSoundsEnabled, setVolume: setSoundVolume, playClick } = useSoundEffects();
  const [soundsOn, setSoundsOn] = useState(() => areSoundsEnabled());
  const [volumePercent, setVolumePercent] = useState(() => Math.round(getSoundVolume() * 100));
  const [desktopNotificationsOn, setDesktopNotificationsOn] = useState(() =>
    areDesktopNotificationsEnabled(),
  );
  const [notificationPermission, setNotificationPermission] = useState(() =>
    getNotificationPermission(),
  );
  const desktopNotificationsSupported = isNotificationSupported();

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const p = await getWhatsAppBusinessProfile(phoneNumberId);
      setProfile(p);
      setEditAbout(p.about ?? '');
      setEditDescription(p.description ?? '');
      setEditAddress(p.address ?? '');
      setEditEmail(p.email ?? '');
      setEditWebsite1(p.websites?.[0] ?? '');
      setEditWebsite2(p.websites?.[1] ?? '');
    } catch (err: unknown) {
      setProfileError((err as Error)?.message || 'Error al cargar perfil');
    } finally {
      setProfileLoading(false);
    }
  }, [phoneNumberId]);

  const loadSnippets = useCallback(async () => {
    setSnippetsLoading(true);
    setSnippetsError(null);
    try {
      const result = await listWhatsAppSnippets();
      setSnippets(Array.isArray(result) ? result : []);
    } catch (err: unknown) {
      setSnippetsError((err as Error)?.message || 'Error al cargar atajos');
      setSnippets([]);
    } finally {
      setSnippetsLoading(false);
    }
  }, []);

  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    setPresetsError(null);
    try {
      const result = await listWhatsAppTemplatePresets();
      setPresets(result);
    } catch (err: unknown) {
      setPresetsError((err as Error)?.message || 'Error al cargar pre-rellenos');
      setPresets([]);
    } finally {
      setPresetsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadSnippets();
    loadPresets();
  }, [loadProfile, loadSnippets, loadPresets]);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      const websites = [editWebsite1, editWebsite2].filter(Boolean);
      await updateWhatsAppBusinessProfile(
        {
          about: editAbout,
          description: editDescription,
          address: editAddress,
          email: editEmail,
          websites,
        },
        phoneNumberId,
      );
      setProfileSuccess(true);
      await loadProfile();
    } catch (err: unknown) {
      setProfileError((err as Error)?.message || 'Error al guardar');
    } finally {
      setProfileSaving(false);
    }
  };

  const openSnippetCreate = () => {
    setSnippetEdit(null);
    setSnippetShortcut('/');
    setSnippetLabel('');
    setSnippetBody('');
    setSnippetError(null);
    setSnippetDialog(true);
  };

  const openSnippetEdit = (s: WhatsAppSnippet) => {
    setSnippetEdit(s);
    setSnippetShortcut(s.shortcut);
    setSnippetLabel(s.label);
    setSnippetBody(s.body);
    setSnippetError(null);
    setSnippetDialog(true);
  };

  const handleSaveSnippet = async () => {
    setSnippetSaving(true);
    setSnippetError(null);
    try {
      if (snippetEdit) {
        await updateSnippetSvc(snippetEdit.id, {
          shortcut: snippetShortcut,
          label: snippetLabel,
          body: snippetBody,
        });
      } else {
        await createWhatsAppSnippet(snippetShortcut, snippetLabel, snippetBody);
      }
      setSnippetDialog(false);
      await loadSnippets();
    } catch (err: unknown) {
      setSnippetError((err as Error)?.message || 'Error al guardar snippet');
    } finally {
      setSnippetSaving(false);
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    try {
      await deleteSnippetSvc(id);
      await loadSnippets();
    } catch (err) {
      console.error('Error deleting snippet:', err);
    }
  };

  const handleToggleSnippetPin = async (snippet: WhatsAppSnippet) => {
    try {
      await updateSnippetSvc(snippet.id, { isPinned: !snippet.isPinned });
      await loadSnippets();
    } catch (err) {
      console.error('Error updating snippet pin:', err);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      await deleteWhatsAppTemplatePreset(presetId);
      await loadPresets();
    } catch (err) {
      console.error('Error deleting preset:', err);
    }
  };

  return (
    <Box sx={{ py: 2 }}>
      <Grid container spacing={3}>
        {/* Perfil WABA */}
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }} data-tour="whatsapp-settings-profile">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <BusinessIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Perfil de negocio (WhatsApp)
                </Typography>
              </Box>

              {profileLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : profileError && !profile ? (
                <Alert severity="error">{profileError}</Alert>
              ) : (
                <Stack spacing={2.5}>
                  {profile?.profilePictureUrl && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar
                        src={profile.profilePictureUrl}
                        sx={{ width: 64, height: 64 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        La foto de perfil se cambia desde Meta Business Manager
                      </Typography>
                    </Box>
                  )}

                  <TextField
                    label="About"
                    value={editAbout}
                    onChange={(e) => setEditAbout(e.target.value)}
                    fullWidth
                    size="small"
                    helperText={`${editAbout?.length ?? 0}/139 caracteres`}
                    inputProps={{ maxLength: 139 }}
                  />
                  <TextField
                    label="Descripción"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    fullWidth
                    size="small"
                    multiline
                    rows={3}
                    helperText={`${editDescription?.length ?? 0}/512 caracteres`}
                    inputProps={{ maxLength: 512 }}
                  />
                  <TextField
                    label="Dirección"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    fullWidth
                    size="small"
                    type="email"
                  />
                  <TextField
                    label="Sitio web 1"
                    value={editWebsite1}
                    onChange={(e) => setEditWebsite1(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="https://..."
                  />
                  <TextField
                    label="Sitio web 2"
                    value={editWebsite2}
                    onChange={(e) => setEditWebsite2(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="https://..."
                  />

                  {profileError && <Alert severity="error">{profileError}</Alert>}
                  {profileSuccess && <Alert severity="success">Perfil actualizado correctamente</Alert>}

                  <Button
                    variant="contained"
                    startIcon={profileSaving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Guardar perfil
                  </Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Snippets */}
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }} data-tour="whatsapp-settings-shortcuts">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <TextSnippetIcon color="primary" />
                <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
                  Atajos rápidos
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={openSnippetCreate}
                  variant="outlined"
                >
                  Nuevo
                </Button>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Escribe el atajo (ej: <code>/gracias</code>) en el campo de mensaje para insertar el texto rápidamente.
              </Typography>

              <Divider sx={{ mb: 1 }} />

              {snippetsError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {snippetsError}
                </Alert>
              )}

              {snippetsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : snippetsError ? null : snippets.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No hay atajos configurados
                </Typography>
              ) : (
                <List disablePadding>
                  {snippets.map((s) => (
                    <ListItem key={s.id} divider sx={{ px: 0 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={s.shortcut}
                              size="small"
                              sx={{ fontFamily: 'monospace', fontWeight: 600, bgcolor: '#e8f5e9', color: '#2e7d32' }}
                            />
                            <Typography variant="body2" fontWeight={500}>
                              {s.label}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {(s.body?.length ?? 0) > 100 ? `${s.body.slice(0, 100)}…` : (s.body ?? '')}
                          </Typography>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          size="small"
                          color={s.isPinned ? 'primary' : 'default'}
                          onClick={() => void handleToggleSnippetPin(s)}
                          aria-label={s.isPinned ? 'Quitar de favoritos' : 'Anclar en favoritos'}
                        >
                          <PushPinIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => openSnippetEdit(s)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteSnippet(s.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <StarIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Pre-rellenos del equipo
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Favoritos compartidos de plantillas Meta. Se crean desde la biblioteca de mensajes al chatear.
              </Typography>
              <Divider sx={{ mb: 1 }} />
              {presetsError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {presetsError}
                </Alert>
              )}
              {presetsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : presets.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  Aún no hay pre-rellenos guardados para el equipo.
                </Typography>
              ) : (
                <List disablePadding>
                  {presets.map((preset) => (
                    <ListItem key={preset.id} divider sx={{ px: 0 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" fontWeight={600}>
                              {preset.presetLabel}
                            </Typography>
                            <Chip label="Equipo" size="small" color="primary" variant="outlined" />
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {getTemplateDisplayName(preset.templateName)} · {preset.templateLanguage}
                          </Typography>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => void handleDeletePreset(preset.id)}
                          aria-label="Eliminar pre-relleno"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <VolumeUpIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Experiencia
                </Typography>
              </Box>
              <Stack spacing={2.5}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={soundsOn}
                      onChange={(_, checked) => {
                        setSoundsOn(checked);
                        setSoundsEnabled(checked);
                        if (checked) playClick();
                      }}
                    />
                  }
                  label="Sonidos de la interfaz"
                />
                <Box sx={{ px: 1 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Volumen ({volumePercent}%)
                  </Typography>
                  <Slider
                    value={volumePercent}
                    min={0}
                    max={100}
                    disabled={!soundsOn}
                    onChange={(_, value) => {
                      const pct = Array.isArray(value) ? value[0] : value;
                      setVolumePercent(pct);
                      setSoundVolume(pct / 100);
                    }}
                    onChangeCommitted={() => {
                      if (soundsOn) playClick();
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Incluye notificaciones de mensajes entrantes y efectos al enviar o cambiar de pestaña.
                </Typography>
                <Divider />
                <FormControlLabel
                  control={
                    <Switch
                      checked={desktopNotificationsOn}
                      disabled={!desktopNotificationsSupported}
                      onChange={async (_, checked) => {
                        if (checked) {
                          const permission = await requestNotificationPermission();
                          setNotificationPermission(permission);
                          if (permission !== 'granted') {
                            setDesktopNotificationsOn(false);
                            setDesktopNotificationsEnabled(false);
                            return;
                          }
                        }
                        setDesktopNotificationsOn(checked);
                        setDesktopNotificationsEnabled(checked);
                      }}
                    />
                  }
                  label="Notificaciones de escritorio"
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  {!desktopNotificationsSupported
                    ? 'Tu navegador no soporta notificaciones de escritorio.'
                    : notificationPermission === 'granted'
                      ? 'Cuando el CRM está en segundo plano, el sistema te alertará con sonido y podrás volver al chat con un clic.'
                      : notificationPermission === 'denied'
                        ? 'Las notificaciones están bloqueadas. Habilítalas en la configuración del navegador para este sitio.'
                        : 'Activa el interruptor para permitir alertas cuando uses otra pestaña u otra aplicación.'}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Snippet Dialog */}
      <Dialog open={snippetDialog} onClose={() => !snippetSaving && setSnippetDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{snippetEdit ? 'Editar atajo' : 'Nuevo atajo rápido'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Atajo"
              value={snippetShortcut}
              onChange={(e) => setSnippetShortcut(e.target.value.toLowerCase().replace(/\s/g, ''))}
              fullWidth
              size="small"
              placeholder="/gracias"
              helperText="Debe comenzar con / y no contener espacios"
            />
            <TextField
              label="Nombre"
              value={snippetLabel}
              onChange={(e) => setSnippetLabel(e.target.value)}
              fullWidth
              size="small"
              placeholder="Agradecimiento"
            />
            <TextField
              label="Texto del mensaje"
              value={snippetBody}
              onChange={(e) => setSnippetBody(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={4}
              placeholder="¡Gracias por comunicarte con Prosavis!"
            />
            {snippetError && <Alert severity="error">{snippetError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnippetDialog(false)} disabled={snippetSaving}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveSnippet}
            disabled={snippetSaving || !snippetShortcut.startsWith('/') || !snippetLabel.trim() || !snippetBody.trim()}
            startIcon={snippetSaving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          >
            {snippetEdit ? 'Actualizar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WhatsAppSettingsTab;
