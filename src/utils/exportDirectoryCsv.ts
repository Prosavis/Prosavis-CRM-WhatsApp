import type { DirectoryEntry } from '@/types/lead';
import { DIRECTORY_STATUS_LABELS } from '@/utils/directoryContactStatus';

const CLASSIFICATION_LABELS: Record<string, string> = {
  user: 'Usuario',
  Empresas: 'Empresas',
  company: 'Empresa',
  lead: 'Lead',
  unknown: 'Desconocido',
};

const SOURCE_LABELS: Record<string, string> = {
  APP_USER: 'App',
  WHATSAPP_INBOUND: 'WhatsApp',
  META_ADS: 'Meta Ads',
  REFERIDO: 'Referido',
  ORGANICO: 'Orgánico',
  BROADCAST: 'Broadcast',
  PANEL: 'Panel',
};

export const DIRECTORY_CSV_HEADERS = [
  'Nombre',
  'Teléfono',
  'Email',
  'Clasificación',
  'Estado',
  'Fuente',
  'Opt-out',
] as const;

function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function buildCsvContent(rows: string[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function entryToCsvRow(entry: DirectoryEntry): string[] {
  const statusKey = entry.status as keyof typeof DIRECTORY_STATUS_LABELS;
  const statusLabel = DIRECTORY_STATUS_LABELS[statusKey] ?? entry.status;
  const classificationLabel =
    CLASSIFICATION_LABELS[entry.classification] ?? entry.classification;
  const sourceLabel = entry.source
    ? (SOURCE_LABELS[entry.source] ?? entry.source)
    : '';

  return [
    entry.fullName || entry.displayName || '',
    entry.phone ?? '',
    entry.email ?? '',
    classificationLabel,
    statusLabel,
    sourceLabel,
    entry.optOut ? 'Sí' : 'No',
  ];
}

export function downloadDirectoryCsv(
  entries: DirectoryEntry[],
  filename = 'directorio-envio-masivo.csv',
): void {
  const rows: string[][] = [[...DIRECTORY_CSV_HEADERS], ...entries.map(entryToCsvRow)];
  const blob = new Blob([buildCsvContent(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
