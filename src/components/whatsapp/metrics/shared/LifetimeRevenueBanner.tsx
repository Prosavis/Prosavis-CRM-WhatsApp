import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { Box, Skeleton, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import React from 'react';

const CURRENCY = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export interface LifetimeRevenueBannerProps {
  lifetimeCollectedTotal: number;
  lifetimePaidAppointmentCount: number;
  loading?: boolean;
}

const LifetimeRevenueBanner: React.FC<LifetimeRevenueBannerProps> = ({
  lifetimeCollectedTotal,
  lifetimePaidAppointmentCount,
  loading = false,
}) => {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';
  const accentColor = isLight ? '#047857' : '#34d399';

  if (loading) {
    return (
      <Skeleton
        variant="rectangular"
        animation="wave"
        height={72}
        sx={{ borderRadius: 2, mb: 2 }}
      />
    );
  }

  return (
    <Box
      sx={{
        mb: 2,
        borderRadius: 2,
        position: 'relative',
        overflow: 'hidden',
        background: isLight
          ? `linear-gradient(135deg, ${alpha('#047857', 0.07)} 0%, ${alpha('#059669', 0.03)} 50%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
          : `linear-gradient(135deg, ${alpha('#34d399', 0.08)} 0%, ${alpha('#10b981', 0.03)} 50%, transparent 100%)`,
        border: `1px solid ${alpha(accentColor, isLight ? 0.18 : 0.15)}`,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: accentColor,
          opacity: 0.5,
        }}
      />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 2, sm: 3 },
          px: { xs: 2, sm: 3 },
          py: { xs: 1.75, sm: 2 },
          flexWrap: 'wrap',
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(accentColor, isLight ? 0.12 : 0.18),
            color: accentColor,
            flexShrink: 0,
          }}
        >
          <SavingsOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
        </Box>
        <Box sx={{ flex: '1 1 200px' }}>
          <Typography
            variant="caption"
            sx={{
              letterSpacing: '0.5px',
              fontWeight: 500,
              color: alpha(theme.palette.text.secondary, 0.8),
              textTransform: 'uppercase',
              fontSize: '0.65rem',
            }}
          >
            Ingresos totales cobrados
          </Typography>
          <Typography
            variant="h5"
            component="p"
            sx={{
              mt: 0.25,
              fontWeight: 800,
              color: accentColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {CURRENCY.format(lifetimeCollectedTotal)}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
            borderRadius: 1,
            bgcolor: alpha(accentColor, isLight ? 0.06 : 0.1),
            border: `1px solid ${alpha(accentColor, isLight ? 0.1 : 0.12)}`,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              color: isLight ? '#065f46' : '#6ee7b7',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lifetimePaidAppointmentCount.toLocaleString('es-CO')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            citas
            <br />
            pagadas
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default LifetimeRevenueBanner;
