import type { Theme } from '@mui/material/styles';

export function getWhatsAppBubbleSx(theme: Theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    maxWidth: '100%',
    bgcolor: isDark ? 'rgba(37, 211, 102, 0.15)' : '#d9fdd3',
    color: 'text.primary',
    borderRadius: 2,
    px: 1.5,
    py: 0.75,
    border: 1,
    borderColor: isDark ? 'rgba(37, 211, 102, 0.35)' : 'rgba(11, 20, 26, 0.08)',
    boxShadow: isDark ? 'none' : '0 1px 0.5px rgba(11,20,26,.13)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  };
}
