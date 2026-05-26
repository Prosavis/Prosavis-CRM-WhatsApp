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
import {
  getWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  listWhatsAppSnippets,
  createWhatsAppSnippet,
  updateWhatsAppSnippet as updateSnippetSvc,
  deleteWhatsAppSnippet as deleteSnippetSvc,
  type WhatsAppBusinessProfile,
  type WhatsAppSnippet,
} from '@/services/whatsappService';
import useSoundEffects from '@/hooks/useSoundEffects';
import {
  areSoundsEnabled,
  getSoundVolume,
} from '@/utils/soundPreferences';

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
  const [snippetDialog, setSnippetDialog] = useState(false);
  const [snippetEdit, setSnippetEdit] = useState<WhatsAppSnippet | null>(null);
  const [snippetShortcut, setSnippetShortcut] = useState('');
  const [snippetLabel, setSnippetLabel] = useState('');
  const [snippetBody, setSnippetBody] = useState('');
  const [snippetSaving, setSnippetSaving] = useState(false);
  const [snippetError, setSnippetError] = useState<string | null>(null);

  const { setEnabled: setSoundsEnabled, setVolume: setSoundVolume, playClick } = useSoundEffects();
  const [soundsOn, setSoundsOn] = useState(() => areSoundsEnabled());
  const [volumePercent, setVolumePercent] = useState(() => Math.round(getSoundVolume() * 100));

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
    try {
      const result = await listWhatsAppSnippets();
      setSnippets(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error('Error loading snippets:', err);
    } finally {
      setSnippetsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadSnippets();
  }, [loadProfile, loadSnippets]);

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

              {snippetsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : snippets.length === 0 ? (
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
