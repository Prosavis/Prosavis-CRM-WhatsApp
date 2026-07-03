import { alpha, type SxProps, type Theme } from '@mui/material/styles';

function normalizeHex(color: string): string | null {
  const trimmed = color.trim();
  if (!trimmed.startsWith('#')) return null;
  const hex = trimmed.slice(1);
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  if (hex.length === 6) return `#${hex}`;
  return null;
}

/** Mezcla el color con blanco para mejorar contraste sobre fondos oscuros. */
export function lightenAccentColor(color: string, amount = 0.42): string {
  const hex = normalizeHex(color);
  if (!hex) return color;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (channel: number) =>
    Math.min(255, Math.round(channel + (255 - channel) * amount));
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export type ColoredChipVariant = 'outlined' | 'filled';

/**
 * Estilos de chip con color de marca/tag legibles en modo claro y oscuro.
 */
export function coloredChipSx(
  theme: Theme,
  color?: string | null,
  variant: ColoredChipVariant = 'outlined',
  options?: { height?: number; fontSize?: string },
): SxProps<Theme> {
  const base = color?.trim() || theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const textColor = isDark ? lightenAccentColor(base, 0.48) : base;
  const bgAlpha = isDark
    ? variant === 'filled'
      ? 0.34
      : 0.24
    : variant === 'filled'
      ? 0.16
      : 0.1;
  const borderAlpha = isDark ? 0.62 : 0.38;

  return {
    ...(options?.height !== undefined ? { height: options.height } : {}),
    ...(options?.fontSize ? { fontSize: options.fontSize } : {}),
    bgcolor: alpha(base, bgAlpha),
    color: textColor,
    borderColor: alpha(base, borderAlpha),
    fontWeight: 600,
    '& .MuiChip-icon': { color: textColor },
    '& .MuiChip-deleteIcon': {
      color: alpha(textColor, 0.78),
      '&:hover': { color: textColor },
    },
  };
}

/**
 * Acento para tarjetas KPI / métricas con icono circular.
 */
export function getMetricAccent(
  theme: Theme,
  accentColor: string,
  lightBackground: string,
): { color: string; bg: string } {
  if (theme.palette.mode === 'dark') {
    return {
      color: lightenAccentColor(accentColor, 0.38),
      bg: alpha(accentColor, 0.22),
    };
  }
  return { color: accentColor, bg: lightBackground };
}
