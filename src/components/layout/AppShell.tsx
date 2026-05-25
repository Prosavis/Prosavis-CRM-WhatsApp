import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';
import { useAuth } from '@/hooks/useAuth';

export default function AppShell({ children }: PropsWithChildren) {
  const { profile, signOut } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 2, md: 3 } }}>
      <Container maxWidth="xl">
        <Box
          component="header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mb: 3,
            p: 2,
            borderRadius: 5,
            bgcolor: 'rgba(255, 255, 255, 0.78)',
            border: '1px solid rgba(7, 94, 84, 0.1)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '16px',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                background:
                  'linear-gradient(135deg, #075e54 0%, #00a884 100%)',
                boxShadow: '0 14px 30px rgba(0, 168, 132, 0.3)',
              }}
            >
              <WhatsAppIcon />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1 }}>
                Prosavis CRM WhatsApp
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Inbox operativo y metricas sobre Supabase
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button
              component={NavLink}
              to="/whatsapp"
              variant="contained"
              startIcon={<WhatsAppIcon />}
            >
              WhatsApp Cloud
            </Button>
            <Chip
              label={profile?.email ?? 'Admin'}
              variant="outlined"
              sx={{ display: { xs: 'none', md: 'inline-flex' } }}
            />
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
