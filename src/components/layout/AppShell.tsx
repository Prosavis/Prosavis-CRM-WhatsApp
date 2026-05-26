import type { PropsWithChildren } from 'react';
import { Box, Container } from '@mui/material';

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: { xs: 1.5, md: 2 },
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: 1920 }}>
        {children}
      </Container>
    </Box>
  );
}
