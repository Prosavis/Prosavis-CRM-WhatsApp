import type { PropsWithChildren } from 'react';
import { Box, Container } from '@mui/material';
import { usePhoneLayout } from '@/hooks/usePhoneLayout';
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight';

export default function AppShell({ children }: PropsWithChildren) {
  useVisualViewportHeight();
  const phoneLayout = usePhoneLayout();

  return (
    <Box
      data-testid="crm-app-shell"
      sx={{
        minHeight: phoneLayout ? 0 : '100vh',
        height: phoneLayout ? 'var(--crm-viewport-height, 100dvh)' : 'auto',
        bgcolor: 'background.default',
        pt: phoneLayout ? 'var(--crm-safe-top)' : 2,
        pr: phoneLayout ? 'var(--crm-safe-right)' : 0,
        pb: phoneLayout ? 0 : 2,
        pl: phoneLayout ? 'var(--crm-safe-left)' : 0,
        overflow: phoneLayout ? 'hidden' : 'visible',
      }}
    >
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          maxWidth: 1920,
          height: phoneLayout ? '100%' : 'auto',
          px: phoneLayout ? 0 : 3,
        }}
      >
        {children}
      </Container>
    </Box>
  );
}
