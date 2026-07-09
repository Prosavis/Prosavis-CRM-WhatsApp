import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress, Stack } from '@mui/material';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/components/auth/LoginPage';
import WhatsAppCloudPage from '@/pages/whatsapp/WhatsAppCloudPage';
import { getProsavisLogoSrc } from '@/utils/prosavisBrand';

function BrandedLoadingScreen() {
  const { mode } = useTheme();

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Stack spacing={2} alignItems="center">
        <Box
          component="img"
          src={getProsavisLogoSrc(mode)}
          alt="Prosavis"
          sx={{ width: 72, height: 72, objectFit: 'contain' }}
        />
        <CircularProgress size={28} />
      </Stack>
    </Box>
  );
}

function ProtectedApp() {
  const { loading, user, isAdmin } = useAuth();

  if (loading) {
    return <BrandedLoadingScreen />;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <LoginPage unauthorized />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/whatsapp" replace />} />
        <Route path="/whatsapp" element={<WhatsAppCloudPage />} />
        <Route path="*" element={<Navigate to="/whatsapp" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}
