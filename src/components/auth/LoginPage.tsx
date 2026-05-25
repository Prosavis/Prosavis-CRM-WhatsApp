import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { WhatsApp as WhatsAppIcon } from '@mui/icons-material';
import { useAuth } from '@/hooks/useAuth';

interface LoginPageProps {
  unauthorized?: boolean;
}

export default function LoginPage({ unauthorized = false }: LoginPageProps) {
  const { signIn, user, isAdmin, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user && isAdmin) {
    return <Navigate to="/whatsapp" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Card sx={{ overflow: 'hidden' }}>
          <Box
            sx={{
              minHeight: 150,
              p: 4,
              color: '#fff',
              background:
                'linear-gradient(135deg, #063f38 0%, #075e54 48%, #00a884 100%)',
              position: 'relative',
            }}
          >
            <WhatsAppIcon sx={{ fontSize: 44, mb: 2 }} />
            <Typography variant="h4">CRM WhatsApp</Typography>
            <Typography sx={{ opacity: 0.85, maxWidth: 420 }}>
              Operacion de conversaciones y metricas con Supabase, aislado de
              Firebase.
            </Typography>
          </Box>
          <CardContent sx={{ p: 4 }}>
            <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
              {unauthorized && (
                <Alert severity="warning">
                  Tu usuario existe, pero no tiene un perfil activo en
                  admin_profiles.
                </Alert>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Correo"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Contrasena"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
              >
                {submitting ? 'Entrando...' : 'Entrar al CRM'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                En local crea un usuario desde Supabase Studio y agrega su id a
                `admin_profiles`.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
