import type { Theme } from '@mui/material/styles';
import { DesignTokens } from '@/constants/designSystem';
import type { QualityLayer } from '@/types/whatsapp';

export interface MetricsPalette {
  favorite: string;
  recurring: string;
  standard: string;
  risk: string;
  warning: string;
  neutral: string;
  grid: string;
  canvas: string;
  density: readonly string[];
}

export function metricsPalette(theme: Theme): MetricsPalette {
  return theme.palette.mode === 'dark'
    ? DesignTokens.dataViz.dark
    : DesignTokens.dataViz.light;
}

export function qualityLayerColor(theme: Theme, layer: QualityLayer): string {
  return metricsPalette(theme)[layer];
}

export function formatMetricInt(value: number): string {
  return value.toLocaleString('es-CO');
}

export function formatMetricPct(value: number, digits = 1): string {
  return `${value.toLocaleString('es-CO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
