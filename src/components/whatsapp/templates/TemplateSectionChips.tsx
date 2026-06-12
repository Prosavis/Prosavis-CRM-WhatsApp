import React from 'react';
import { Box, Chip, Stack } from '@mui/material';

export interface TemplateSectionChipItem {
  key: string;
  label: string;
  count?: number;
}

interface TemplateSectionChipsProps {
  sections: TemplateSectionChipItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

const TemplateSectionChips: React.FC<TemplateSectionChipsProps> = ({
  sections,
  activeKey,
  onChange,
}) => {
  if (sections.length <= 1) return null;

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1,
        py: 0.75,
        bgcolor: 'background.default',
        borderBottom: 1,
        borderColor: 'divider',
        mb: 1,
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', pb: 0.25 }}>
        {sections.map((section) => {
          const selected = activeKey === section.key;
          const label =
            section.count != null ? `${section.label} (${section.count})` : section.label;
          return (
            <Chip
              key={section.key}
              label={label}
              size="small"
              clickable
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => onChange(section.key)}
              sx={{ flexShrink: 0 }}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

export default TemplateSectionChips;
