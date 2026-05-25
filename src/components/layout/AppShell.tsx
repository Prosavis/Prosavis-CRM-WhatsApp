import type { PropsWithChildren } from 'react';
import { Box, Button, Chip, Container, Stack } from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import ThemeToggle from '@/components/common/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getProSavisLogoSrc } from '@/utils/prosavisBrand';

export default function AppShell({ children }: PropsWithChildren) {
  const { profile, signOut } = useAuth();
  const { mode } = useTheme();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: { xs: 1.5, md: 2 },
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: 1920 }}>
        <Box
          component="header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mb: 1.5,
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Box
            component="img"
            src={getProSavisLogoSrc(mode)}
            alt="ProSavis"
            sx={{
              width: 36,
              height: 36,
              objectFit: 'contain',
            }}
          />

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              label={profile?.email ?? 'Admin'}
              size="small"
              variant="outlined"
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, maxWidth: 220 }}
            />
            <ThemeToggle size="small" />
            <Button
              variant="text"
              color="inherit"
              size="small"
              startIcon={<LogoutIcon />}
              onClick={() => void signOut()}
            >
              Salir
            </Button>
          </Stack>
        </Box>

        {children}
      </Container>
    </Box>
  );
}
