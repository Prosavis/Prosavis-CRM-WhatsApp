import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CardContent,
  CircularProgress,
  Container,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Email as EmailIcon, Lock as LockIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';
import AnimatedCard from '@/components/common/AnimatedCard';
import ThemeToggle from '@/components/common/ThemeToggle';
import { BORDER_RADIUS, COLORS, SIZES, SPACING } from '@/constants/styles';
import { DesignTokens } from '@/constants/designSystem';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getProSavisLogoSrc } from '@/utils/prosavisBrand';

interface LoginPageProps {
  unauthorized?: boolean;
}

export default function LoginPage({ unauthorized = false }: LoginPageProps) {
  const { signIn, user, isAdmin, loading } = useAuth();
  const { mode } = useTheme();
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
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container component="main" maxWidth="md">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'background.default',
          background:
            mode === 'dark'
              ? `linear-gradient(135deg, ${COLORS.dark.background.default} 0%, ${COLORS.dark.background.paper} 50%, ${COLORS.dark.background.elevated} 100%)`
              : 'linear-gradient(135deg, #f5f7fa 0%, #ffffff 50%, #e8f4f8 100%)',
          position: 'relative',
          overflow: 'hidden',
          px: { xs: 2, sm: 3, md: 4 },
          '&::before':
            mode === 'dark'
              ? {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at 30% 20%, ${DesignTokens.brand.primary.orange}08 0%, transparent 40%), radial-gradient(circle at 70% 80%, ${DesignTokens.brand.primary.orange}06 0%, transparent 40%)`,
                  zIndex: 0,
                }
              : {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at 30% 20%, ${DesignTokens.brand.primary.orange}03 0%, transparent 40%), radial-gradient(circle at 70% 80%, rgba(59, 130, 246, 0.03) 0%, transparent 40%)`,
                  zIndex: 0,
                },
        }}
      >
        <Box sx={{ position: 'absolute', top: SPACING.lg, right: SPACING.lg, zIndex: 10 }}>
          <ThemeToggle size="medium" />
        </Box>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ width: '100%', maxWidth: 600, zIndex: 1 }}
        >
          <AnimatedCard
            enableHover
            sx={{
              width: '100%',
              minHeight: 420,
              boxShadow:
                mode === 'dark'
                  ? '0 20px 40px rgba(0,0,0,0.6), 0 0 25px rgba(255, 119, 0, 0.2)'
                  : '0 15px 35px rgba(0,0,0,0.1), 0 0 15px rgba(255, 119, 0, 0.1)',
              borderRadius: BORDER_RADIUS.lg,
              overflow: 'hidden',
              background:
                mode === 'dark'
                  ? `linear-gradient(145deg, ${COLORS.dark.background.paper}fa, ${COLORS.dark.background.elevated}fc)`
                  : 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(248,250,252,0.99))',
              backdropFilter: 'blur(20px)',
              border:
                mode === 'dark'
                  ? '1px solid rgba(255, 119, 0, 0.15)'
                  : '1px solid rgba(255, 119, 0, 0.08)',
            }}
          >
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  minHeight: 420,
                  flexDirection: { xs: 'column', sm: 'row' },
                }}
              >
                <Box
                  sx={{
                    flex: { xs: 'none', sm: '0 0 240px' },
                    background: `linear-gradient(135deg, ${DesignTokens.brand.primary.orange} 0%, ${DesignTokens.brand.secondary.lightOrange} 60%, #FFB366 100%)`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    p: { xs: 3, sm: 4 },
                    position: 'relative',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.08)',
                    },
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                    style={{ zIndex: 1, textAlign: 'center' }}
                  >
                    <Box
                      component="img"
                      src={getProSavisLogoSrc(mode)}
                      alt="ProSavis"
                      sx={{
                        width: { xs: 100, sm: 140 },
                        height: 'auto',
                        mb: 2,
                        objectFit: 'contain',
                      }}
                    />
                    <Typography
                      variant="h5"
                      fontWeight={DesignTokens.typography.fontWeight.bold}
                      sx={{
                        color: DesignTokens.dark.text.primary,
                        letterSpacing: '-0.01em',
                        textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                        fontSize: { xs: '1.5rem', sm: '1.75rem' },
                        mb: 1,
                      }}
                    >
                      ProSavis
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'rgba(255, 255, 255, 0.9)',
                        fontWeight: 500,
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                        fontSize: '0.875rem',
                      }}
                    >
                      CRM WhatsApp
                    </Typography>
                  </motion.div>
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    p: { xs: 3, sm: 4 },
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    <Box sx={{ mb: 3, textAlign: 'center' }}>
                      <Typography
                        variant="h5"
                        fontWeight={DesignTokens.typography.fontWeight.bold}
                        sx={{
                          color:
                            mode === 'dark'
                              ? COLORS.dark.text.primary
                              : COLORS.light.text.primary,
                          mb: 1,
                          fontSize: SIZES.fontSize.xl,
                        }}
                      >
                        Bienvenido
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color:
                            mode === 'dark'
                              ? COLORS.dark.text.secondary
                              : COLORS.light.text.secondary,
                          fontSize: SIZES.fontSize.sm,
                        }}
                      >
                        Accede con tu cuenta de administrador
                      </Typography>
                    </Box>

                    <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
                      {unauthorized && (
                        <Alert severity="warning">
                          Tu usuario existe, pero no tiene un perfil activo en admin_profiles.
                        </Alert>
                      )}
                      {error && <Alert severity="error">{error}</Alert>}

                      <TextField
                        fullWidth
                        label="Correo electrónico"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        disabled={submitting}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <EmailIcon
                                sx={{
                                  color:
                                    mode === 'dark'
                                      ? 'rgba(255, 119, 0, 0.7)'
                                      : DesignTokens.brand.primary.blue,
                                }}
                              />
                            </InputAdornment>
                          ),
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: BORDER_RADIUS.md } }}
                      />
                      <TextField
                        fullWidth
                        label="Contraseña"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        disabled={submitting}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockIcon
                                sx={{
                                  color:
                                    mode === 'dark'
                                      ? 'rgba(255, 119, 0, 0.7)'
                                      : DesignTokens.brand.primary.blue,
                                }}
                              />
                            </InputAdornment>
                          ),
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: BORDER_RADIUS.md } }}
                      />
                      <Button
                        fullWidth
                        type="submit"
                        size="large"
                        variant="contained"
                        disabled={submitting}
                        startIcon={
                          submitting ? <CircularProgress size={20} color="inherit" /> : <LockIcon />
                        }
                        sx={{
                          py: 2,
                          borderRadius: BORDER_RADIUS.md,
                          fontWeight: DesignTokens.typography.fontWeight.semibold,
                          fontSize: SIZES.fontSize.md,
                          background: `linear-gradient(135deg, ${DesignTokens.brand.primary.orange} 0%, ${DesignTokens.brand.secondary.lightOrange} 100%)`,
                          color: DesignTokens.dark.text.primary,
                          boxShadow: '0 4px 15px rgba(255, 119, 0, 0.3)',
                          '&:hover': {
                            background: `linear-gradient(135deg, ${DesignTokens.brand.secondary.darkOrange} 0%, ${DesignTokens.brand.primary.orange} 100%)`,
                            boxShadow: '0 6px 20px rgba(255, 119, 0, 0.4)',
                            transform: 'translateY(-2px)',
                          },
                          transition: DesignTokens.transitions.default,
                        }}
                      >
                        {submitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
                      </Button>

                      <Box
                        sx={{
                          textAlign: 'center',
                          p: 2,
                          borderRadius: BORDER_RADIUS.md,
                          backgroundColor:
                            mode === 'dark' ? 'rgba(255, 119, 0, 0.05)' : 'rgba(255, 119, 0, 0.03)',
                          border: `1px solid ${
                            mode === 'dark' ? 'rgba(255, 119, 0, 0.1)' : 'rgba(255, 119, 0, 0.08)'
                          }`,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          Solo para administradores autorizados
                        </Typography>
                      </Box>
                    </Stack>
                  </motion.div>
                </Box>
              </Box>
            </CardContent>
          </AnimatedCard>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
          <Box sx={{ mt: 4, textAlign: 'center', zIndex: 1, position: 'relative' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              © ProSavis · CRM independiente
            </Typography>
          </Box>
        </motion.div>
      </Box>
    </Container>
  );
}
