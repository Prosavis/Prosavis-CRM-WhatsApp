import { useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface MediaInsightPanelProps {
  title: string;
  icon: ReactNode;
  preview: string;
  children: ReactNode;
  note?: string;
  retryLabel: string;
  busyLabel: string;
  busy?: boolean;
  onRetry: () => void;
}

export function MediaInsightPanel({
  title,
  icon,
  preview,
  children,
  note,
  retryLabel,
  busyLabel,
  busy = false,
  onRetry,
}: MediaInsightPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1,
        bgcolor: 'rgba(37, 211, 102, 0.08)',
        minWidth: 0,
        maxWidth: '100%',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <Box
          component="button"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            p: 0,
            border: 0,
            bgcolor: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
          }}
        >
          {icon}
          <Typography variant="caption" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
            {title}
          </Typography>
          <ExpandMoreIcon
            sx={{
              fontSize: 16,
              flexShrink: 0,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          />
        </Box>
        <Button
          size="small"
          variant="text"
          disabled={busy}
          onClick={onRetry}
          sx={{ px: 0, minWidth: 0, flexShrink: 0 }}
        >
          {busy ? busyLabel : retryLabel}
        </Button>
      </Box>
      {note ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {note}
        </Typography>
      ) : null}
      {open ? (
        <Box sx={{ mt: 0.25, minWidth: 0, maxWidth: '100%' }}>
          {children}
        </Box>
      ) : (
        <Typography
          variant="body2"
          sx={{
            mt: 0.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {preview}
        </Typography>
      )}
    </Box>
  );
}
