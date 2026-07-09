/**
 * SISTEMA DE DISEÑO CENTRALIZADO - PROSAVIS CRM WHATSAPP
 *
 * Este archivo define el sistema de diseño completo de la aplicación,
 * similar al design system de Prosavis-App.
 *
 * PROPÓSITO:
 * - Mantener coherencia visual en todas las páginas
 * - Facilitar el desarrollo de nuevas funcionalidades
 * - Permitir cambios globales de diseño desde un solo lugar
 * - Mejorar la mantenibilidad del código
 *
 * ESTRUCTURA:
 * - Tokens de diseño (colores, espaciado, tipografía)
 * - Componentes reutilizables
 * - Patrones de layout
 * - Utilidades de estilo
 */

// ============================================================================
// TOKENS DE DISEÑO - BASE DEL SISTEMA
// ============================================================================

/**
 * PALETA DE COLORES
 * Definición centralizada de todos los colores de la aplicación
 *
 * NOTA: Estos colores son la ÚNICA fuente de verdad.
 * No importar desde theme.ts para evitar dependencias circulares.
 */
export const DesignTokens = {
  // Colores de marca Prosavis
  brand: {
    primary: {
      orange: '#FF7700',
      blue: '#002446',
    },
    secondary: {
      lightOrange: '#FF9933',
      darkOrange: '#CC5500',
      lightBlue: '#003D73',
      darkBlue: '#001529',
    },
  },

  // Colores semánticos (estados)
  semantic: {
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
    info: '#2196f3',
  },

  // Colores de estado para verificaciones
  verification: {
    verified: '#4caf50',
    pending: '#ff9800',
    rejected: '#f44336',
    inactive: '#757575',
  },

  // Colores para gráficos y visualizaciones
  charts: {
    purple: '#6750A4',      // Morado Material Design
    teal: '#009688',        // Verde azulado
    cyan: '#00bcd4',        // Cyan
    lightCyan: '#4fc3f7',   // Cyan claro
    pink: '#f48fb1',        // Rosa claro
    deepPurple: '#9c27b0',  // Púrpura profundo
    lightGreen: '#81c784',  // Verde claro
    amber: '#ffcc80',       // Ámbar
    lightRed: '#ffcdd2',    // Rojo claro
    lightBlue: '#90caf9',   // Azul claro
    lightOrange: '#ffb74d', // Naranja claro
    android: '#3DDC84',     // Verde Android
    star: '#ffc107',        // Amarillo estrella
  },

  // Modo oscuro (optimizado para mejor contraste)
  dark: {
    background: {
      default: '#0f1419', // Fondo principal profundo
      paper: '#1e252e', // Cards y superficies (más claro que antes #1a2027)
      elevated: '#2a3441', // Superficies elevadas (más claro que antes #242b35)
      header: '#1e252e',
      row: '#1e252e',
      rowEven: '#242b35',
    },
    text: {
      primary: '#ffffff', // Texto principal blanco puro
      secondary: '#e2e8f0', // Texto secundario más claro
      tertiary: '#cbd5e0', // Texto terciario mejorado
      muted: '#a0aec0', // Texto muted más visible (antes #94a3b8)
    },
    border: {
      default: '#404b5a', // Bordes más visibles (antes #334155)
      light: '#556070', // Bordes claros (antes #475569)
      divider: '#404b5a', // Divisores más visibles (antes #334155)
    },
  },

  // Modo claro
  light: {
    background: {
      default: '#f8f9fa',
      paper: '#ffffff',
      elevated: '#ffffff',
      header: '#f5f5f5',
      row: '#ffffff',
      rowEven: '#f8f9fa',
    },
    text: {
      primary: '#212121',
      secondary: '#757575',
      tertiary: '#9e9e9e',
      muted: '#bdbdbd',
    },
    border: {
      default: '#e0e0e0',
      light: '#f0f0f0',
      divider: '#e0e0e0',
    },
  },

  // Espaciado (basado en múltiplos de 4px)
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },

  // Radios de borde
  borderRadius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // Sombras
  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.05)',
    sm: '0 1px 3px rgba(0,0,0,0.1)',
    md: '0 4px 8px rgba(0,0,0,0.15)',
    lg: '0 8px 16px rgba(0,0,0,0.2)',
    xl: '0 12px 24px rgba(0,0,0,0.25)',
  },

  // Tipografía
  typography: {
    fontSize: {
      xs: '0.75rem', // 12px
      sm: '0.875rem', // 14px
      md: '1rem', // 16px
      lg: '1.125rem', // 18px
      xl: '1.25rem', // 20px
      '2xl': '1.5rem', // 24px
      '3xl': '2rem', // 32px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  // Transiciones
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    default: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Z-index
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
} as const;

// ============================================================================
// COMPONENTES DE DISEÑO - PATRONES REUTILIZABLES
// ============================================================================

/**
 * Anchos estándar para columnas de tablas
 */
export const TableColumnWidths = {
  avatar: 70,
  checkbox: 50,
  name: 180,
  email: 280,
  phone: 180,
  status: 120,
  actions: 200,
  date: 160,
  small: 100,
  medium: 180,
  large: 280,
  extraLarge: 400,
  uid: 220,
} as const;

/**
 * Configuración de responsive por breakpoint
 */
export const Breakpoints = {
  xs: '0px',
  sm: '600px',
  md: '960px',
  lg: '1280px',
  xl: '1920px',
} as const;

/**
 * Patrones de layout comunes
 */
export const LayoutPatterns = {
  // Padding de página responsive
  pagePadding: {
    xs: 1,
    sm: 2,
    md: 3,
  },

  // Espaciado entre secciones
  sectionSpacing: {
    xs: 2,
    sm: 3,
    md: 4,
  },

  // Grid responsive
  grid: {
    xs: 12,
    sm: 6,
    md: 4,
    lg: 3,
    xl: 2,
  },
} as const;

// ============================================================================
// TIPOS TYPESCRIPT PARA AUTOCOMPLETADO
// ============================================================================

// Nota: ThemeMode y SpacingValue ya están exportados en styles.ts
// para evitar conflictos de tipos duplicados
export type FontSizeValue = keyof typeof DesignTokens.typography.fontSize;
export type BorderRadiusValue = keyof typeof DesignTokens.borderRadius;
