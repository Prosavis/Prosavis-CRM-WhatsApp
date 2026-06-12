import React from 'react';
import { Box, Chip, IconButton, Stack, Typography } from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { WhatsAppSnippet } from '@/services/whatsappService';

interface SnippetLibraryListProps {
  snippets: WhatsAppSnippet[];
  onInsert: (snippet: WhatsAppSnippet) => void;
  onTogglePin?: (snippet: WhatsAppSnippet) => void;
}

const SnippetLibraryList: React.FC<SnippetLibraryListProps> = ({
  snippets,
  onInsert,
  onTogglePin,
}) => {
  if (snippets.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
        No hay atajos que coincidan con la búsqueda.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {snippets.map((snippet) => (
        <Box
          key={snippet.id}
          sx={{
            borderRadius: 1.5,
            p: 1.25,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box
              sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
              onClick={() => onInsert(snippet)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onInsert(snippet);
                }
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                <Chip
                  label={snippet.shortcut}
                  size="small"
                  sx={{ fontFamily: 'monospace', fontWeight: 600, height: 22 }}
                />
                <Typography variant="body2" fontWeight={600}>
                  {snippet.label}
                </Typography>
                {snippet.isPinned && (
                  <Chip
                    icon={<PushPinIcon sx={{ fontSize: '14px !important' }} />}
                    label="Favorito"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 22 }}
                  />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {snippet.body}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.25}>
              {onTogglePin && (
                <IconButton
                  size="small"
                  aria-label={snippet.isPinned ? 'Quitar de favoritos' : 'Anclar en favoritos'}
                  color={snippet.isPinned ? 'primary' : 'default'}
                  onClick={() => onTogglePin(snippet)}
                >
                  <PushPinIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton
                size="small"
                aria-label="Insertar atajo"
                onClick={() => onInsert(snippet)}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
};

export default SnippetLibraryList;
