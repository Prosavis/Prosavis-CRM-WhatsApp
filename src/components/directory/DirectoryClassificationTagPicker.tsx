import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  FormHelperText,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import type { DirectoryEntry } from '@/types/lead';
import { directoryService } from '@/services/directoryService';
import { listWhatsAppTags } from '@/services/whatsappService';
import type { WhatsAppTag } from '@/types/whatsapp';
import { getClassificationLabel, tagNamesToIds } from '@/utils/classificationLabels';
import { coloredChipSx } from '@/utils/coloredChipStyles';

export interface DirectoryClassificationTagPickerProps {
  entry: DirectoryEntry;
  disabled?: boolean;
  /** Modo controlado: ids seleccionados */
  value?: string[];
  onChange?: (tagIds: string[]) => void;
  /** Guardar inmediatamente al cambiar (tabla / side panel) */
  autoSave?: boolean;
  onSaved?: (entry: DirectoryEntry) => void;
  onError?: (message: string) => void;
  compact?: boolean;
  label?: string;
}

export const DirectoryClassificationTagPicker: React.FC<
  DirectoryClassificationTagPickerProps
> = ({
  entry,
  disabled = false,
  value,
  onChange,
  autoSave = false,
  onSaved,
  onError,
  compact = false,
  label = 'Clasificación (tags)',
}) => {
  const theme = useTheme();
  const [catalog, setCatalog] = useState<WhatsAppTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [internalIds, setInternalIds] = useState<string[]>([]);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const selectedIds = value ?? internalIds;

  const setSelectedIds = useCallback(
    (ids: string[]) => {
      if (onChange) onChange(ids);
      else setInternalIds(ids);
    },
    [onChange]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listWhatsAppTags()
      .then((tags) => {
        if (cancelled) return;
        setCatalog(tags);
        const initial = tagNamesToIds(entry.tags ?? [], tags);
        if (value === undefined) setInternalIds(initial);
      })
      .catch((err) => {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : 'Error cargando tags');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.tags, onError, value]);

  const persistTags = useCallback(
    async (tagIds: string[]) => {
      setSaving(true);
      try {
        const updated = await directoryService.setClassificationTags(entry.id, tagIds);
        onSaved?.(updated);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'No se pudo guardar la clasificación');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [entry.id, onError, onSaved]
  );

  const handleToggle = useCallback(
    async (tagId: string) => {
      const next = selectedIds.includes(tagId)
        ? selectedIds.filter((id) => id !== tagId)
        : [...selectedIds, tagId];
      setSelectedIds(next);
      if (autoSave) {
        await persistTags(next);
      }
    },
    [autoSave, persistTags, selectedIds, setSelectedIds]
  );

  const selectedTags = useMemo(
    () => catalog.filter((t) => selectedIds.includes(t.id)),
    [catalog, selectedIds]
  );

  const displayLabel =
    selectedTags.length > 0
      ? selectedTags.map((t) => t.name).join(', ')
      : getClassificationLabel(entry.classification);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: compact ? 0 : 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          Cargando tags…
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {!compact && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {label}
        </Typography>
      )}
      <Stack
        direction="row"
        spacing={0.5}
        flexWrap="wrap"
        useFlexGap
        alignItems="center"
        onClick={(e) => {
          if (!disabled && !saving) setAnchorEl(e.currentTarget);
        }}
        sx={{
          cursor: disabled || saving ? 'default' : 'pointer',
          minHeight: compact ? 28 : 36,
          p: compact ? 0 : 0.5,
          borderRadius: 1,
          '&:hover': disabled || saving ? undefined : { bgcolor: 'action.hover' },
        }}
      >
        {saving && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              size="small"
              sx={coloredChipSx(theme, tag.color, 'outlined', { height: 22 })}
              variant="outlined"
            />
          ))
        ) : (
          <Chip
            label={displayLabel}
            size="small"
            variant="outlined"
            icon={<LocalOfferOutlinedIcon />}
            sx={{ height: 22 }}
          />
        )}
        {!disabled && !compact && (
          <Typography variant="caption" color="primary" sx={{ ml: 0.5 }}>
            Editar
          </Typography>
        )}
      </Stack>
      {!compact && (
        <FormHelperText>
          El tipo del contacto se define con los tags de WhatsApp (ej. Cliente Potencial, Agendado).
        </FormHelperText>
      )}

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ minWidth: 240, maxWidth: 320, py: 0.5 }}>
          <Typography variant="subtitle2" sx={{ px: 2, py: 1 }}>
            Clasificación
          </Typography>
          {catalog.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>
              No hay tags configurados. Créalos desde el inbox de WhatsApp.
            </Typography>
          ) : (
            <List dense disablePadding>
              {catalog.map((tag) => {
                const checked = selectedIds.includes(tag.id);
                return (
                  <ListItemButton key={tag.id} onClick={() => void handleToggle(tag.id)}>
                    <Chip
                      label={tag.name}
                      size="small"
                      sx={{
                        mr: 1,
                        ...coloredChipSx(theme, tag.color, checked ? 'filled' : 'outlined'),
                      }}
                      variant={checked ? 'filled' : 'outlined'}
                    />
                    <ListItemText
                      primary={checked ? 'Asignado' : 'Sin asignar'}
                      primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </Popover>
    </Box>
  );
};

/** Persiste tags desde un formulario (DirectoryEditDialog). */
export async function saveDirectoryClassificationTags(
  entryId: string,
  tagIds: string[]
): Promise<DirectoryEntry> {
  return directoryService.setClassificationTags(entryId, tagIds);
}

export default DirectoryClassificationTagPicker;
