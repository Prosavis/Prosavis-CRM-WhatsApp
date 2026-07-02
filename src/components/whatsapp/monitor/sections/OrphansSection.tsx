import React, { useState } from 'react';
import {
  Box, Stack, Typography, Collapse, IconButton, List, ListItem, ListItemText, Chip,
} from '@mui/material';
import { LinkOff as OrphanIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from '@mui/icons-material';
import BentoCard from '../ui/BentoCard';
import type { StorageSuggestion } from '@/services/monitorService';

interface OrphansSectionProps {
  suggestions: StorageSuggestion[];
}

const OrphansSection: React.FC<OrphansSectionProps> = ({ suggestions }) => {
  const [open, setOpen] = useState(false);
  const orphanSuggestion = suggestions.find((s) => s.id === 'orphan_objects');
  if (!orphanSuggestion) return null;

  return (
    <BentoCard sx={{ height: '100%' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        <OrphanIcon color="warning" />
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          Objetos huérfanos
        </Typography>
        <Chip label="warning" size="small" color="warning" variant="outlined" />
        <IconButton size="small">
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {orphanSuggestion.message}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Usa &quot;Reconciliar índice&quot; en Optimización para crear filas en whatsapp_media_assets desde message_log.
            Los objetos outbound o legacy sin referencia en message_log permanecen en Storage (no se borran).
          </Typography>
          <List dense>
            <ListItem disablePadding>
              <ListItemText
                primary="Storage sin índice DB"
                secondary="Objetos en bucket sin fila en whatsapp_media_assets"
              />
            </ListItem>
            <ListItem disablePadding>
              <ListItemText
                primary="DB sin objeto Storage"
                secondary="Filas en whatsapp_media_assets cuyo archivo ya no existe"
              />
            </ListItem>
          </List>
        </Box>
      </Collapse>
    </BentoCard>
  );
};

export default OrphansSection;
