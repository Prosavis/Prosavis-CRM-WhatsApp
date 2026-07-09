import { DesignTokens } from '@/constants/designSystem';
import { ProsavisColors } from '@/theme/theme';

export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
} as const;

export const BORDER_RADIUS = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const COLORS = {
  brand: {
    orange: ProsavisColors.orange,
    blue: ProsavisColors.blue,
    lightOrange: ProsavisColors.lightOrange,
    darkOrange: ProsavisColors.darkOrange,
    lightBlue: ProsavisColors.lightBlue,
    darkBlue: ProsavisColors.darkBlue,
  },
  dark: {
    background: {
      default: '#0a0e13',
      paper: '#1a1f26',
      elevated: '#0f1419',
    },
    text: {
      primary: '#ffffff',
      secondary: '#cbd5e0',
    },
  },
  light: {
    background: {
      default: '#f8f9fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#212121',
      secondary: DesignTokens.verification.inactive,
    },
  },
} as const;

export const SIZES = {
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '2rem',
  },
} as const;

export const ANIMATIONS = {
  card: {
    hidden: {
      opacity: 0,
      y: 20,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      },
    },
  },
  cardWithDelay: (delay: number = 0) => ({
    hidden: {
      opacity: 0,
      y: 20,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        delay,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      },
    },
  }),
  cardHover: {
    hover: {
      y: -4,
      scale: 1.02,
      transition: {
        duration: 0.2,
        ease: 'easeOut',
      },
    },
    tap: {
      scale: 0.98,
      transition: {
        duration: 0.1,
      },
    },
  },
} as const;
