import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Logout as LogoutIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';
import { DesignTokens } from '@/constants/designSystem';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';

export default function AppShell({ children }: PropsWithChildren) {
  const { profile, signOut } = useAuth();
  const { mode, toggleMode } = useTheme();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: { xs: 2, md: 3 },
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
            mb: 3,
            p: 2,
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            boxShadow: 1,
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                background: `linear-gradient(135deg, ${DesignTokens.brand.primary.blue}, ${DesignTokens.brand.primary.orange})`,
              }}
            >
              <WhatsAppIcon />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1, fontWeight: 700 }}>
                Prosavis CRM WhatsApp
              </Typography>
              <Typography variant="body2" color="text.secondary">
                WhatsApp Cloud · Supabase
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button
              component={NavLink}
              to="/whatsapp"
              variant="contained"
              color="primary"
              startIcon={<WhatsAppIcon />}
            >
              WhatsApp Cloud
            </Button>
            <Chip
              label={profile?.email ?? 'Admin'}
              variant="outlined"
              sx={{ display: { xs: 'none', md: 'inline-flex' } }}
            />
            <Tooltip title={mode === 'light' ? 'Modo oscuro' : 'Modo claro'}>
              <IconButton onClick={toggleMode} color="inherit">
                {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
            </Tooltip>
            <Button
              variant="text"
              color="inherit"
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
