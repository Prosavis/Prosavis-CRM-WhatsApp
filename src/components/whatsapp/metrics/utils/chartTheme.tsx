import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import { lightenAccentColor } from '@/utils/coloredChipStyles';

/**
 * Helpers de diseño compartidos para los gráficos de métricas (recharts):
 * gradientes, tooltip estilizado, formateadores de eje y paleta desde el theme.
 */

/** Ajusta un color de marca para que tenga buen contraste en modo oscuro. */
export function chartColor(theme: Theme, base: string, amount = 0.32): string {
  return theme.palette.mode === 'dark' ? lightenAccentColor(base, amount) : base;
}

/** Estilo de las etiquetas de eje. */
export function chartAxisTick(theme: Theme) {
  return {
    fontSize: 11,
    fill: theme.palette.text.secondary,
    fontWeight: 500,
  } as const;
}

/** Color de la retícula, sutil y coherente con el theme. */
export function chartGridStroke(theme: Theme): string {
  return alpha(
    theme.palette.divider,
    theme.palette.mode === 'dark' ? 0.55 : 0.9,
  );
}

/** Formatea enteros de forma compacta para los ejes (1.2k, 3,4M…). */
export function formatAxisInt(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}k`;
  }
  return value.toLocaleString('es-CO');
}

/** Gradiente vertical para barras (opaco arriba → translúcido abajo). */
export const BarGradient: React.FC<{
  id: string;
  color: string;
  from?: number;
  to?: number;
}> = ({ id, color, from = 0.95, to = 0.55 }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor={color} stopOpacity={from} />
    <stop offset="100%" stopColor={color} stopOpacity={to} />
  </linearGradient>
);

/** Gradiente para el relleno bajo una línea/área de tendencia. */
export const AreaGradient: React.FC<{ id: string; color: string }> = ({ id, color }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor={color} stopOpacity={0.26} />
    <stop offset="95%" stopColor={color} stopOpacity={0} />
  </linearGradient>
);

export interface TooltipRowSpec {
  label: string;
  value: string;
  color?: string;
}

/**
 * Tarjeta de tooltip estilizada y genérica, reutilizable por los gráficos.
 */
export const ChartTooltipCard: React.FC<{
  title: string;
  subtitle?: string;
  rows: TooltipRowSpec[];
  hint?: string;
}> = ({ title, subtitle, rows, hint }) => (
  <Box
    sx={{
      minWidth: 168,
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1.5,
      px: 1.5,
      py: 1.25,
      boxShadow: (t) =>
        t.palette.mode === 'dark'
          ? '0 8px 24px rgba(0,0,0,0.5)'
          : '0 8px 24px rgba(17,24,39,0.12)',
    }}
  >
    <Typography variant="body2" fontWeight={700} sx={{ mb: subtitle ? 0 : 0.75 }}>
      {title}
    </Typography>
    {subtitle && (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        {subtitle}
      </Typography>
    )}
    <Stack spacing={0.5}>
      {rows.map((row) => (
        <Stack
          key={row.label}
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1.5}
        >
          <Stack direction="row" alignItems="center" spacing={0.75}>
            {row.color && (
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '3px',
                  bgcolor: row.color,
                  flexShrink: 0,
                }}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {row.label}
            </Typography>
          </Stack>
          <Typography variant="caption" fontWeight={700}>
            {row.value}
          </Typography>
        </Stack>
      ))}
    </Stack>
    {hint && (
      <Typography
        variant="caption"
        color="primary.main"
        sx={{ display: 'block', mt: 0.75, fontWeight: 600 }}
      >
        {hint}
      </Typography>
    )}
  </Box>
);
