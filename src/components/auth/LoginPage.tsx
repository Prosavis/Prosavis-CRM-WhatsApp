import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import { Google as GoogleIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';
import AnimatedCard from '@/components/common/AnimatedCard';
import ThemeToggle from '@/components/common/ThemeToggle';
import { BORDER_RADIUS, COLORS, SIZES, SPACING } from '@/constants/styles';
import { DesignTokens } from '@/constants/designSystem';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getProsavisLogoSrc } from '@/utils/prosavisBrand';

interface LoginPageProps {
  unauthorized?: boolean;
}

export default function LoginPage({ unauthorized = false }: LoginPageProps) {
  const { signInWithGoogle, user, isAdmin, loading } = useAuth();
  const { mode } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user && isAdmin) {
    return <Navigate to="/whatsapp" replace />;
  }

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.'
      );
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
                      src={getProsavisLogoSrc(mode)}
                      alt="Prosavis"
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
                      Prosavis
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
                        Accede con tu cuenta de Google autorizada
                      </Typography>
                    </Box>

                    <Stack spacing={2.5}>
                      {unauthorized && (
                        <Alert severity="warning">
                          Tu cuenta de Google no tiene un perfil activo de administrador CRM.
                        </Alert>
                      )}

                      {error && <Alert severity="error">{error}</Alert>}

                      <Button
                        fullWidth
                        size="large"
                        variant="contained"
                        onClick={handleGoogleLogin}
                        disabled={submitting || loading}
                        startIcon={
                          submitting ? (
                            <CircularProgress size={20} color="inherit" />
                          ) : (
                            <GoogleIcon />
                          )
                        }
                        sx={{
                          py: 2,
                          borderRadius: BORDER_RADIUS.md,
                          fontWeight: DesignTokens.typography.fontWeight.semibold,
                          fontSize: SIZES.fontSize.md,
                          background: '#4285f4',
                          color: DesignTokens.dark.text.primary,
                          boxShadow: '0 4px 15px rgba(66, 133, 244, 0.3)',
                          '&:hover': {
                            background: '#3367d6',
                            boxShadow: '0 6px 20px rgba(66, 133, 244, 0.4)',
                            transform: 'translateY(-2px)',
                          },
                          '&:disabled': {
                            background:
                              mode === 'dark'
                                ? 'rgba(255, 255, 255, 0.1)'
                                : 'rgba(0, 0, 0, 0.1)',
                            color:
                              mode === 'dark'
                                ? 'rgba(255, 255, 255, 0.3)'
                                : 'rgba(0, 0, 0, 0.3)',
                          },
                          transition: DesignTokens.transitions.default,
                        }}
                      >
                        {submitting ? 'Conectando...' : 'Continuar con Google'}
                      </Button>

                      <Box
                        sx={{
                          textAlign: 'center',
                          p: 2,
                          borderRadius: BORDER_RADIUS.md,
                          backgroundColor:
                            mode === 'dark'
                              ? 'rgba(255, 119, 0, 0.05)'
                              : 'rgba(255, 119, 0, 0.03)',
                          border: `1px solid ${
                            mode === 'dark'
                              ? 'rgba(255, 119, 0, 0.1)'
                              : 'rgba(255, 119, 0, 0.08)'
                          }`,
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: SIZES.fontSize.xs, lineHeight: 1.5 }}
                        >
                          Solo Google · administradores autorizados
                        </Typography>
                      </Box>
                    </Stack>
                  </motion.div>
                </Box>
              </Box>
            </CardContent>
          </AnimatedCard>
        </motion.div>
      </Box>
    </Container>
  );
}
