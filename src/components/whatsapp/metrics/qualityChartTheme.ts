import type { QualityLayer } from '@/types/whatsapp';
import { DesignTokens } from '@/constants/designSystem';

export const QUALITY_LAYER_COLORS: Record<QualityLayer, string> = {
  favorite: DesignTokens.dataViz.light.favorite,
  recurring: DesignTokens.dataViz.light.recurring,
  standard: DesignTokens.dataViz.light.standard,
  risk: DesignTokens.dataViz.light.risk,
};

export const QUALITY_TAG_COLORS: Record<string, string> = {
  favoritos: DesignTokens.dataViz.light.favorite,
  problematica: DesignTokens.dataViz.light.risk,
  bloqueado: DesignTokens.dataViz.light.neutral,
  decline: DesignTokens.dataViz.light.risk,
  recurrente: DesignTokens.dataViz.light.recurring,
  empresas: DesignTokens.dataViz.light.warning,
  agendado: DesignTokens.dataViz.light.recurring,
  parar: DesignTokens.dataViz.light.neutral,
};

export function formatRatio(ratio: number | null): string {
  if (ratio == null) return '—';
  return `1 cada ${ratio.toLocaleString('es-CO')}`;
}
