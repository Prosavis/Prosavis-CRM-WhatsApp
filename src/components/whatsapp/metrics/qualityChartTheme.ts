import type { QualityLayer } from '@/types/whatsapp';

export const QUALITY_LAYER_COLORS: Record<QualityLayer, string> = {
  favorite: '#2e7d32',
  recurring: '#1976d2',
  standard: '#90a4ae',
  risk: '#c62828',
};

export const QUALITY_TAG_COLORS: Record<string, string> = {
  favoritos: '#2e7d32',
  problematica: '#e64a19',
  bloqueado: '#616161',
  decline: '#b71c1c',
  recurrente: '#64b5f6',
  empresas: '#ef6c00',
  agendado: '#1976d2',
  parar: '#455a64',
};

export function formatRatio(ratio: number | null): string {
  if (ratio == null) return '—';
  return `1 cada ${ratio.toLocaleString('es-CO')}`;
}
