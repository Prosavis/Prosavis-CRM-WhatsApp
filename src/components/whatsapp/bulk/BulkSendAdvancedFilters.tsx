import React from 'react';
import {
  Autocomplete,
  Box,
  Chip,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { WhatsAppTag } from '@/services/whatsappService';
import {
  BULK_AUDIENCE_TAG_FILTER_LABELS,
  BULK_CLASSIFICATION_LABELS,
  BULK_CLASSIFICATION_OPTIONS,
  BULK_QUALITY_TAG_LABELS,
  type BulkAudienceAdvancedFilters,
  type BulkAudienceListFilterMode,
  type BulkAudienceTagFilterMode,
} from './bulkSendTypes';

export interface BulkSendAdvancedFiltersProps {
  filters: BulkAudienceAdvancedFilters;
  onChange: (filters: BulkAudienceAdvancedFilters) => void;
  waTags: WhatsAppTag[];
  directoryTagSuggestions: string[];
  showDirectoryTags?: boolean;
  onToggleDirectoryTags?: () => void;
}

const QUALITY_OPTIONS = ['good', 'standard', 'bad'] as const;

const BulkSendAdvancedFilters: React.FC<BulkSendAdvancedFiltersProps> = ({
  filters,
  onChange,
  waTags,
  directoryTagSuggestions,
  showDirectoryTags = false,
  onToggleDirectoryTags,
}) => {
  const patch = (partial: Partial<BulkAudienceAdvancedFilters>) => {
    onChange({ ...filters, ...partial });
  };

  const selectedWaTags = waTags.filter((t) => filters.waTagIds.includes(t.id));

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
          Tags WhatsApp
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filters.waTagMode}
            onChange={(_, value: BulkAudienceTagFilterMode | null) => {
              if (value) patch({ waTagMode: value });
            }}
            sx={{ flexShrink: 0 }}
          >
            {(Object.keys(BULK_AUDIENCE_TAG_FILTER_LABELS) as BulkAudienceTagFilterMode[]).map((mode) => (
              <ToggleButton key={mode} value={mode} sx={{ textTransform: 'none', px: 1.25 }}>
                {BULK_AUDIENCE_TAG_FILTER_LABELS[mode]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Autocomplete
            multiple
            size="small"
            options={waTags}
            value={selectedWaTags}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, value) => patch({ waTagIds: value.map((t) => t.id) })}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option.id}
                  label={option.name}
                  size="small"
                  sx={{
                    bgcolor: option.color || '#1976d2',
                    color: '#fff',
                    '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.8)' },
                  }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} placeholder={waTags.length ? 'Seleccionar tags…' : 'Sin tags creados'} />
            )}
            sx={{ flex: 1, minWidth: 200 }}
            disabled={waTags.length === 0}
          />
        </Stack>
      </Box>

      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Etiquetas directorio
          </Typography>
          {onToggleDirectoryTags && (
            <Chip
              label={showDirectoryTags ? 'Ocultar' : 'Mostrar'}
              size="small"
              variant="outlined"
              onClick={onToggleDirectoryTags}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Stack>
        <Collapse in={showDirectoryTags}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filters.directoryTagMode}
              onChange={(_, value: BulkAudienceTagFilterMode | null) => {
                if (value) patch({ directoryTagMode: value });
              }}
              sx={{ flexShrink: 0 }}
            >
              {(Object.keys(BULK_AUDIENCE_TAG_FILTER_LABELS) as BulkAudienceTagFilterMode[]).map((mode) => (
                <ToggleButton key={mode} value={mode} sx={{ textTransform: 'none', px: 1.25 }}>
                  {BULK_AUDIENCE_TAG_FILTER_LABELS[mode]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Autocomplete
              multiple
              freeSolo
              size="small"
              options={directoryTagSuggestions}
              value={filters.directoryTags}
              onChange={(_, value) => patch({ directoryTags: value.map((v) => v.trim()).filter(Boolean) })}
              renderInput={(params) => (
                <TextField {...params} placeholder="Etiquetas del contacto en directorio…" />
              )}
              sx={{ flex: 1, minWidth: 200 }}
            />
          </Stack>
        </Collapse>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
          Tipo (clasificación CRM)
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filters.classificationMode}
            onChange={(_, value: BulkAudienceListFilterMode | null) => {
              if (value) patch({ classificationMode: value });
            }}
          >
            <ToggleButton value="include" sx={{ textTransform: 'none' }}>
              Incluir
            </ToggleButton>
            <ToggleButton value="exclude" sx={{ textTransform: 'none' }}>
              Excluir
            </ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {BULK_CLASSIFICATION_OPTIONS.map((key) => {
              const active = filters.classifications.includes(key);
              return (
                <Chip
                  key={key}
                  label={BULK_CLASSIFICATION_LABELS[key]}
                  size="small"
                  variant={active ? 'filled' : 'outlined'}
                  color={active ? (key === 'user' ? 'primary' : key === 'lead' ? 'warning' : 'default') : 'default'}
                  onClick={() => {
                    const next = active
                      ? filters.classifications.filter((c) => c !== key)
                      : [...filters.classifications, key];
                    patch({ classifications: next });
                  }}
                  sx={{ cursor: 'pointer' }}
                />
              );
            })}
          </Stack>
        </Stack>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
          Calidad
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filters.qualityTagMode}
            onChange={(_, value: BulkAudienceListFilterMode | null) => {
              if (value) patch({ qualityTagMode: value });
            }}
          >
            <ToggleButton value="include" sx={{ textTransform: 'none' }}>
              Incluir
            </ToggleButton>
            <ToggleButton value="exclude" sx={{ textTransform: 'none' }}>
              Excluir
            </ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="bulk-quality-filter-label">Calidad</InputLabel>
            <Select
              labelId="bulk-quality-filter-label"
              label="Calidad"
              multiple
              value={filters.qualityTags}
              onChange={(e) => {
                const value = e.target.value;
                patch({
                  qualityTags: typeof value === 'string' ? value.split(',') : value,
                });
              }}
              renderValue={(selected) =>
                (selected as string[])
                  .map((q) => BULK_QUALITY_TAG_LABELS[q] ?? q)
                  .join(', ')
              }
            >
              {QUALITY_OPTIONS.map((q) => (
                <MenuItem key={q} value={q}>
                  {BULK_QUALITY_TAG_LABELS[q]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Box>
    </Stack>
  );
};

export default BulkSendAdvancedFilters;
