import React, { useEffect, useState } from 'react';
import { Box, Popover, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { WHATSAPP_TAG_PRESET_COLORS } from '@/constants';
import { normalizeHexColor } from '@/utils/tagFolders';

export interface TagColorPickerPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  value: string;
  onChange: (color: string) => void;
  onClose: () => void;
}

const TagColorPickerPopover: React.FC<TagColorPickerPopoverProps> = ({
  open,
  anchorEl,
  value,
  onChange,
  onClose,
}) => {
  const [hexDraft, setHexDraft] = useState(value);

  useEffect(() => {
    if (open) setHexDraft(value);
  }, [open, value]);

  const applyHex = () => {
    const normalized = normalizeHexColor(hexDraft);
    if (normalized) onChange(normalized);
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Box sx={{ p: 1.5, width: 240, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Presets
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {WHATSAPP_TAG_PRESET_COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => onChange(c)}
              role="button"
              aria-label={`Color ${c}`}
              sx={(theme) => ({
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: c,
                cursor: 'pointer',
                border:
                  value.toLowerCase() === c.toLowerCase()
                    ? `3px solid ${theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.text.primary}`
                    : `2px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.25)' : alpha(theme.palette.common.black, 0.08)}`,
                '&:hover': { opacity: 0.85, transform: 'scale(1.08)' },
                transition: 'transform 0.15s ease, opacity 0.15s ease',
              })}
            />
          ))}
        </Box>

        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Personalizado
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="input"
            type="color"
            value={normalizeHexColor(value) ?? '#1976d2'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            aria-label="Selector de color"
            sx={{
              width: 40,
              height: 36,
              p: 0,
              border: 'none',
              bgcolor: 'transparent',
              cursor: 'pointer',
            }}
          />
          <TextField
            size="small"
            label="Hex"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={applyHex}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyHex();
              }
            }}
            placeholder="#00a884"
            inputProps={{ maxLength: 7, spellCheck: false }}
            sx={{ flex: 1 }}
          />
        </Box>
      </Box>
    </Popover>
  );
};

export default TagColorPickerPopover;
