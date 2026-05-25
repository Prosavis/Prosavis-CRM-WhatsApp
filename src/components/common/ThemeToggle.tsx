import React from 'react';
import { IconButton, Tooltip, Box, useTheme as useMuiTheme } from '@mui/material';
import { Brightness4 as DarkModeIcon, Brightness7 as LightModeIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { DesignTokens } from '@/constants/designSystem';
import { areSoundsEnabled, getSoundVolume } from '@/utils/soundPreferences';

interface ThemeToggleProps {
  size?: 'small' | 'medium' | 'large';
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ size = 'medium' }) => {
  const { mode, toggleMode } = useTheme();
  const muiTheme = useMuiTheme();

  const handleToggle = () => {
    if (typeof window !== 'undefined' && 'Audio' in window && areSoundsEnabled()) {
      try {
        const audio = new Audio('/assets/audio/transition.mp3');
        audio.volume = getSoundVolume();
        void audio.play().catch(() => {});
      } catch {
        // Sin archivo de transición: el cambio de tema sigue funcionando.
      }
    }
    toggleMode();
  };

  const iconVariants = {
    initial: { scale: 0, rotate: -180 },
    animate: { scale: 1, rotate: 0 },
    exit: { scale: 0, rotate: 180 },
  };

  const buttonVariants = {
    hover: { scale: 1.05, transition: { duration: 0.2 } },
    tap: { scale: 0.95, transition: { duration: 0.1 } },
  };

  return (
    <Tooltip title={`Cambiar a modo ${mode === 'light' ? 'oscuro' : 'claro'}`} arrow>
      <Box component={motion.div} variants={buttonVariants} whileHover="hover" whileTap="tap">
        <IconButton
          onClick={handleToggle}
          size={size}
          sx={{
            color: mode === 'dark' ? DesignTokens.brand.primary.orange : muiTheme.palette.primary.main,
            backgroundColor:
              mode === 'dark' ? `${DesignTokens.brand.primary.orange}1A` : 'rgba(0, 36, 70, 0.05)',
            border:
              mode === 'dark'
                ? `1px solid ${DesignTokens.brand.primary.orange}33`
                : '1px solid rgba(0, 36, 70, 0.1)',
            borderRadius: '50%',
            width: size === 'small' ? 36 : size === 'large' ? 48 : 40,
            height: size === 'small' ? 36 : size === 'large' ? 48 : 40,
            transition: DesignTokens.transitions.default,
            '&:hover': {
              backgroundColor:
                mode === 'dark' ? `${DesignTokens.brand.primary.orange}26` : 'rgba(0, 36, 70, 0.1)',
              transform: 'translateY(-1px)',
              boxShadow:
                mode === 'dark'
                  ? `0 4px 20px ${DesignTokens.brand.primary.orange}4D`
                  : '0 4px 15px rgba(0, 36, 70, 0.2)',
            },
          }}
        >
          <motion.div
            key={mode}
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {mode === 'light' ? <DarkModeIcon fontSize={size} /> : <LightModeIcon fontSize={size} />}
          </motion.div>
        </IconButton>
      </Box>
    </Tooltip>
  );
};

export default ThemeToggle;
