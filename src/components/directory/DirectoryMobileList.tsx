import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import DirectoryClassificationTagPicker from '@/components/directory/DirectoryClassificationTagPicker';
import type { DirectoryEntry } from '@/types/lead';

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  opt_out: 'Opt-out',
};

const SOURCE_LABELS: Record<string, string> = {
  APP_USER: 'App',
  WHATSAPP_INBOUND: 'WhatsApp',
  META_ADS: 'Meta Ads',
  REFERIDO: 'Referido',
  ORGANICO: 'Orgánico',
  BROADCAST: 'Masivo',
  PANEL: 'Panel',
};

interface DirectoryMobileListProps {
  entries: DirectoryEntry[];
  loading: boolean;
  searchTerm: string;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onOpenEntry: (entry: DirectoryEntry) => void;
  onEntryUpdated: (entry: DirectoryEntry) => void;
  onOpenInbox?: (phone: string, name?: string) => void;
  onCreate: () => void;
}

export default function DirectoryMobileList({
  entries,
  loading,
  searchTerm,
  selectedIds,
  onToggleSelect,
  onOpenEntry,
  onEntryUpdated,
  onOpenInbox,
  onCreate,
}: DirectoryMobileListProps) {
  if (loading) {
    return (
      <Stack spacing={1} sx={{ p: 1 }}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} variant="rounded" height={132} />
        ))}
      </Stack>
    );
  }

  if (entries.length === 0) {
    return (
      <Stack alignItems="center" spacing={1.25} sx={{ px: 2, py: 6, textAlign: 'center' }}>
        <PeopleIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
        <Typography fontWeight={700}>
          {searchTerm ? 'Nadie coincide con esa búsqueda' : 'Todavía no hay clientes aquí'}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {searchTerm
            ? 'Prueba otro nombre, teléfono o email, o limpia los filtros.'
            : 'Agrega un cliente para tenerlo a mano cuando entre por WhatsApp.'}
        </Typography>
        {!searchTerm ? (
          <Button variant="contained" onClick={onCreate}>
            Nuevo cliente
          </Button>
        ) : null}
      </Stack>
    );
  }

  return (
    <Stack component="ul" spacing={1} sx={{ p: 1, m: 0, listStyle: 'none' }}>
      {entries.map((entry) => {
        const canMessage = Boolean(entry.phone && entry.status !== 'opt_out');
        const displayName = entry.fullName || entry.displayName || 'Sin nombre';
        return (
          <Box
            component="li"
            key={entry.id}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              p: 1.25,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Checkbox
                checked={selectedIds.has(entry.id)}
                disabled={!canMessage}
                onChange={() => onToggleSelect(entry.id)}
                inputProps={{ 'aria-label': `Seleccionar ${displayName}` }}
                sx={{ width: 44, height: 44, p: 1.25 }}
              />
              <ContactAvatar
                displayName={displayName}
                phone={entry.phone}
                photoUrl={entry.photoUrl}
                size={44}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={700} noWrap>{displayName}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {entry.phone || entry.email || 'Sin datos de contacto'}
                </Typography>
              </Box>
              <IconButton
                aria-label={`Abrir ficha de ${displayName}`}
                onClick={() => onOpenEntry(entry)}
                sx={{ width: 44, height: 44 }}
              >
                <OpenInNewIcon />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip
                size="small"
                label={STATUS_LABELS[entry.status] || entry.status}
                color={entry.status === 'active' ? 'success' : entry.status === 'opt_out' ? 'error' : 'default'}
              />
              <Chip
                size="small"
                variant="outlined"
                label={SOURCE_LABELS[entry.source as string] || entry.source || 'Sin fuente'}
              />
              {(entry.tags || []).slice(0, 2).map((tag) => (
                <Chip key={tag} size="small" variant="outlined" label={tag} />
              ))}
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
              sx={{ mt: 1 }}
            >
              <Box onClick={(event) => event.stopPropagation()} sx={{ minWidth: 0, flex: 1 }}>
                <DirectoryClassificationTagPicker
                  entry={entry}
                  compact
                  autoSave
                  onSaved={onEntryUpdated}
                />
              </Box>
              {onOpenInbox ? (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<WhatsAppIcon />}
                  disabled={!canMessage}
                  aria-label={`Abrir en inbox: ${displayName}`}
                  onClick={() => {
                    if (!entry.phone || !canMessage) return;
                    onOpenInbox(entry.phone, displayName);
                  }}
                  sx={{ minHeight: 44, flexShrink: 0 }}
                >
                  Chat
                </Button>
              ) : null}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
