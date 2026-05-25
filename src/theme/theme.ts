import type { PaletteMode } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { DesignTokens } from '@/constants/designSystem';

// Colores comunes para ambos modos
const commonColors = {
  success: {
    main: DesignTokens.semantic.success,
    light: '#81c784',
    dark: '#388e3c',
  },
  warning: {
    main: DesignTokens.semantic.warning,
    light: '#ffcc02',
    dark: '#f57c00',
  },
  error: {
    main: DesignTokens.semantic.error,
    light: '#e57373',
    dark: '#d32f2f',
  },
  info: {
    main: DesignTokens.semantic.info,
    light: '#64b5f6',
    dark: '#1976d2',
  },
  grey: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eeeeee',
    300: '#e0e0e0',
    400: '#bdbdbd',
    500: '#9e9e9e',
    600: DesignTokens.verification.inactive,
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
};

// Paleta para modo claro (Brand Colors originales)
const lightPalette = {
  ...commonColors,
  primary: {
    main: DesignTokens.brand.primary.blue,
    light: DesignTokens.brand.secondary.lightBlue,
    dark: DesignTokens.brand.secondary.darkBlue,
    contrastText: '#ffffff',
  },
  secondary: {
    main: DesignTokens.brand.primary.orange,
    light: DesignTokens.brand.secondary.lightOrange,
    dark: DesignTokens.brand.secondary.darkOrange,
    contrastText: '#ffffff',
  },
  accent: {
    main: DesignTokens.brand.primary.orange,
    light: DesignTokens.brand.secondary.lightOrange,
    dark: DesignTokens.brand.secondary.darkOrange,
    contrastText: '#ffffff',
  },
};

// Paleta para modo oscuro (Colores adaptados para contraste)
const darkPalette = {
  ...commonColors,
  primary: {
    main: '#90caf9', // Azul claro para mejor legibilidad en fondo oscuro
    light: '#e3f2fd',
    dark: '#42a5f5',
    contrastText: 'rgba(0, 0, 0, 0.87)',
  },
  secondary: {
    main: '#ffb74d', // Naranja claro
    light: '#ffe97d',
    dark: '#f57c00',
    contrastText: 'rgba(0, 0, 0, 0.87)',
  },
  accent: {
    main: '#ffb74d',
    light: '#ffe97d',
    dark: '#f57c00',
    contrastText: 'rgba(0, 0, 0, 0.87)',
  },
};

// Función para crear tema dinámico
const createProSavisTheme = (mode: PaletteMode) => {
  const palette = mode === 'light' ? lightPalette : darkPalette;

  return createTheme({
    palette: {
      mode,
      ...palette,
      ...(mode === 'light'
        ? {
            // Modo día (usando tokens del sistema)
            background: {
              default: DesignTokens.light.background.default,
              paper: DesignTokens.light.background.paper,
            },
            text: {
              primary: DesignTokens.light.text.primary,
              secondary: DesignTokens.light.text.secondary,
            },
            divider: DesignTokens.light.border.divider,
          }
        : {
            // Modo noche (usando tokens del sistema)
            background: {
              default: DesignTokens.dark.background.default,
              paper: DesignTokens.dark.background.paper,
            },
            text: {
              primary: DesignTokens.dark.text.primary,
              secondary: DesignTokens.dark.text.secondary,
            },
            divider: DesignTokens.dark.border.divider,
            action: {
              hover: 'rgba(255, 119, 0, 0.08)',
              selected: 'rgba(255, 119, 0, 0.16)',
            },
          }),
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h1: {
        fontSize: '2.5rem',
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: '-0.01562em',
      },
      h2: {
        fontSize: '2rem',
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: '-0.00833em',
      },
      h3: {
        fontSize: '1.75rem',
        fontWeight: 600,
        lineHeight: 1.3,
        letterSpacing: '0em',
      },
      h4: {
        fontSize: '1.5rem',
        fontWeight: 600,
        lineHeight: 1.35,
        letterSpacing: '0.00735em',
      },
      h5: {
        fontSize: '1.25rem',
        fontWeight: 600,
        lineHeight: 1.4,
        letterSpacing: '0em',
      },
      h6: {
        fontSize: '1.125rem',
        fontWeight: 600,
        lineHeight: 1.45,
        letterSpacing: '0.0075em',
      },
      subtitle1: {
        fontSize: '1rem',
        fontWeight: 500,
        lineHeight: 1.5,
        letterSpacing: '0.00938em',
      },
      subtitle2: {
        fontSize: '0.875rem',
        fontWeight: 500,
        lineHeight: 1.55,
        letterSpacing: '0.00714em',
      },
      body1: {
        fontSize: '1rem',
        fontWeight: 400,
        lineHeight: 1.6,
        letterSpacing: '0.00938em',
      },
      body2: {
        fontSize: '0.875rem',
        fontWeight: 400,
        lineHeight: 1.6,
        letterSpacing: '0.01071em',
      },
      button: {
        fontSize: '0.875rem',
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: '0.02857em',
        textTransform: 'none' as const,
      },
      caption: {
        fontSize: '0.75rem',
        fontWeight: 400,
        lineHeight: 1.4,
        letterSpacing: '0.03333em',
      },
      overline: {
        fontSize: '0.75rem',
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: '0.08333em',
        textTransform: 'uppercase' as const,
      },
    },
    shape: {
      borderRadius: parseInt(DesignTokens.borderRadius.md),
    },
    spacing: parseInt(DesignTokens.spacing.sm),
    components: {
      // Configuración de Material-UI components
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: DesignTokens.borderRadius.md,
            textTransform: 'none',
            fontWeight: DesignTokens.typography.fontWeight.medium,
            boxShadow: 'none',
            transition: DesignTokens.transitions.default,
            '&:hover': {
              boxShadow:
                mode === 'light'
                  ? DesignTokens.shadows.sm
                  : '0 4px 20px rgba(255, 119, 0, 0.3)',
              transform: 'translateY(-1px)',
            },
          },
          contained: {
            '&:hover': {
              boxShadow:
                mode === 'light'
                  ? DesignTokens.shadows.md
                  : '0 8px 25px rgba(255, 119, 0, 0.4)',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: DesignTokens.borderRadius.lg,
            boxShadow:
              mode === 'light'
                ? DesignTokens.shadows.sm
                : DesignTokens.shadows.lg,
            border:
              mode === 'dark'
                ? `1px solid ${DesignTokens.dark.border.default}`
                : 'none',
            backgroundColor:
              mode === 'dark' ? DesignTokens.dark.background.paper : undefined,
            '&:hover': {
              boxShadow:
                mode === 'light'
                  ? DesignTokens.shadows.md
                  : '0 8px 25px rgba(255, 119, 0, 0.25)',
              transform: 'translateY(-2px)',
              border:
                mode === 'dark'
                  ? `1px solid ${DesignTokens.dark.border.light}`
                  : undefined,
            },
            transition: DesignTokens.transitions.default,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: DesignTokens.borderRadius.md,
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor:
                  mode === 'dark' ? 'rgba(255, 119, 0, 0.3)' : undefined,
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor:
                  mode === 'dark'
                    ? DesignTokens.brand.primary.orange
                    : undefined,
              },
            },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight:
              mode === 'light'
                ? `1px solid ${commonColors.grey[200]}`
                : `1px solid ${DesignTokens.dark.border.default}`,
            backgroundColor:
              mode === 'light'
                ? DesignTokens.light.background.paper
                : DesignTokens.dark.background.paper,
            backgroundImage:
              mode === 'dark'
                ? `linear-gradient(145deg, ${DesignTokens.dark.background.paper} 0%, ${DesignTokens.dark.background.elevated} 100%)`
                : 'none',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor:
              mode === 'light'
                ? DesignTokens.light.background.paper
                : DesignTokens.dark.background.paper,
            color:
              mode === 'light'
                ? DesignTokens.brand.primary.blue
                : DesignTokens.dark.text.primary,
            boxShadow:
              mode === 'light'
                ? DesignTokens.shadows.sm
                : '0 2px 10px rgba(0,0,0,0.5)',
            borderBottom:
              mode === 'light'
                ? `1px solid ${commonColors.grey[200]}`
                : `1px solid ${DesignTokens.dark.border.default}`,
            backdropFilter: mode === 'dark' ? 'blur(10px)' : 'none',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: DesignTokens.borderRadius.sm,
            fontWeight: DesignTokens.typography.fontWeight.medium,
            '&.MuiChip-filled': {
              backgroundColor:
                mode === 'dark' ? 'rgba(255, 119, 0, 0.15)' : undefined,
              color: mode === 'dark' ? '#FFA040' : undefined,
              border:
                mode === 'dark'
                  ? '1px solid rgba(255, 119, 0, 0.3)'
                  : undefined,
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor:
              mode === 'light'
                ? commonColors.grey[50]
                : 'rgba(255, 119, 0, 0.08)',
            '& .MuiTableCell-head': {
              fontWeight: DesignTokens.typography.fontWeight.semibold,
              color:
                mode === 'light'
                  ? commonColors.grey[800]
                  : DesignTokens.dark.text.primary,
              borderBottom:
                mode === 'light'
                  ? `1px solid ${commonColors.grey[300]}`
                  : `1px solid ${DesignTokens.dark.border.default}`,
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor:
                mode === 'light'
                  ? commonColors.grey[50]
                  : 'rgba(255, 119, 0, 0.08)',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom:
              mode === 'light'
                ? `1px solid ${commonColors.grey[300]}`
                : `1px solid ${DesignTokens.dark.border.default}`,
            color: mode === 'dark' ? DesignTokens.dark.text.primary : undefined,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: DesignTokens.borderRadius.md,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: DesignTokens.borderRadius.lg,
            backgroundColor:
              mode === 'light'
                ? DesignTokens.light.background.paper
                : DesignTokens.dark.background.paper,
            border:
              mode === 'dark'
                ? `1px solid ${DesignTokens.dark.border.default}`
                : 'none',
            boxShadow:
              mode === 'dark' ? '0 24px 48px rgba(0, 0, 0, 0.5)' : undefined,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: DesignTokens.borderRadius.md,
            boxShadow:
              mode === 'light'
                ? DesignTokens.shadows.md
                : '0 12px 32px rgba(0, 0, 0, 0.5)',
            border:
              mode === 'light'
                ? `1px solid ${commonColors.grey[200]}`
                : `1px solid ${DesignTokens.dark.border.default}`,
            backgroundColor:
              mode === 'light'
                ? DesignTokens.light.background.paper
                : DesignTokens.dark.background.elevated,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: DesignTokens.borderRadius.md,
            margin: `${DesignTokens.spacing.xs} ${DesignTokens.spacing.sm}`,
            '&:hover': {
              backgroundColor:
                mode === 'light'
                  ? 'rgba(0, 36, 70, 0.08)'
                  : 'rgba(255, 119, 0, 0.08)',
            },
            '&.Mui-selected': {
              backgroundColor:
                mode === 'light'
                  ? 'rgba(255, 119, 0, 0.12)'
                  : 'rgba(255, 119, 0, 0.16)',
              '&:hover': {
                backgroundColor:
                  mode === 'light'
                    ? 'rgba(255, 119, 0, 0.16)'
                    : 'rgba(255, 119, 0, 0.20)',
              },
            },
          },
        },
      },
    },
  });
};

// Temas preconfigurados
export const lightTheme = createProSavisTheme('light');
export const darkTheme = createProSavisTheme('dark');

// Tema por defecto
export const theme = lightTheme;

// Export para crear temas dinámicos
export { createProSavisTheme };
export default theme;

// Re-export de colores desde el sistema de diseño (única fuente de verdad)
export const ProSavisColors = {
  orange: DesignTokens.brand.primary.orange,
  blue: DesignTokens.brand.primary.blue,
  lightOrange: DesignTokens.brand.secondary.lightOrange,
  darkOrange: DesignTokens.brand.secondary.darkOrange,
  lightBlue: DesignTokens.brand.secondary.lightBlue,
  darkBlue: DesignTokens.brand.secondary.darkBlue,
};
