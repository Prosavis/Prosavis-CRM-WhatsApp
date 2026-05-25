import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/components/auth/LoginPage';
import WhatsAppCloudPage from '@/pages/whatsapp/WhatsAppCloudPage';

function ProtectedApp() {
  const { loading, user, isAdmin } = useAuth();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
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
