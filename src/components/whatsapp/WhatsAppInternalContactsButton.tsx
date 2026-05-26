import React, { useCallback, useState } from 'react';
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
  Button,
  Snackbar,
  Alert,
} from '@mui/material';
import ContactsIcon from '@mui/icons-material/Contacts';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import {
  WHATSAPP_INTERNAL_CONTACTS,
  type WhatsAppInternalContact,
} from '@/constants/whatsappInternalDirectory';

function waMeUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '#';
}

function displayValue(c: WhatsAppInternalContact): string {
  if (c.kind === 'email') return c.value;
  return c.copyDisplay ?? c.value;
}

const WhatsAppInternalContactsButton: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const open = Boolean(anchorEl);

  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`Copiado: ${label}`);
    } catch {
      setCopyFeedback('No se pudo copiar al portapapeles');
    }
  }, []);

  return (
    <>
      <Tooltip title="Contactos internos: línea Meta, correos y teléfonos">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ color: 'primary.main' }}
          aria-label="Abrir contactos internos"
        >
          <ContactsIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { maxWidth: 400, p: 1 } } }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ px: 1, pb: 0.5 }}>
          Contactos internos
        </Typography>
        <List dense disablePadding>
          {WHATSAPP_INTERNAL_CONTACTS.map((c) => {
            const text = displayValue(c);
            const waUrl = c.kind === 'phone' ? waMeUrl(c.value) : null;
            return (
              <ListItem
                key={`${c.kind}-${c.value}`}
                disableGutters
                sx={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  py: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 0 },
                }}
              >
                <ListItemText
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                  secondaryTypographyProps={{ variant: 'caption', component: 'div' }}
                  primary={c.label}
                  secondary={
                    <Box component="span" sx={{ display: 'block', mt: 0.25 }}>
                      {c.description}
                    </Box>
                  }
                />
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                    mt: 0.75,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      flex: '1 1 140px',
                      minWidth: 0,
                      wordBreak: 'break-word',
                      fontFamily: c.kind === 'email' ? 'inherit' : 'ui-monospace, monospace',
                    }}
                  >
                    {text}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => void handleCopy(c.copyDisplay ?? c.value, c.label)}
                  >
                    Copiar
                  </Button>
                  {c.kind === 'phone' && waUrl && waUrl !== '#' && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<WhatsAppIcon />}
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      component="a"
                      sx={{ textTransform: 'none' }}
                    >
                      WhatsApp
                    </Button>
                  )}
                </Box>
              </ListItem>
            );
          })}
        </List>
      </Popover>

      <Snackbar open={Boolean(copyFeedback)} autoHideDuration={2500} onClose={() => setCopyFeedback(null)}>
        <Alert severity="success" variant="filled" onClose={() => setCopyFeedback(null)} sx={{ width: '100%' }}>
          {copyFeedback}
        </Alert>
      </Snackbar>
    </>
  );
};

export default WhatsAppInternalContactsButton;
