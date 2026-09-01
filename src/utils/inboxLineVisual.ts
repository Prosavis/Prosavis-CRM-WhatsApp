import type { Theme } from '@mui/material/styles';
import { DesignTokens } from '@/constants/designSystem';
import type { WhatsAppLineId } from './whatsappLines';

export const INBOX_LINE_DNA = {
  bot: {
    id: 'bot' as const,
    label: 'Inbox Bot',
    hex: DesignTokens.inboxLines.bot,
    letter: 'B',
  },
  commercial: {
    id: 'commercial' as const,
    label: 'Inbox Comercial',
    hex: DesignTokens.inboxLines.commercial,
    letter: 'C',
  },
} as const;

export const DIRECTORY_SHELL_HEX = DesignTokens.inboxLines.directory;

export function inboxLineHex(line: WhatsAppLineId): string {
  return INBOX_LINE_DNA[line].hex;
}

export function inboxLineLabel(line: WhatsAppLineId): string {
  return INBOX_LINE_DNA[line].label;
}

export function inboxLineMuiColor(line: WhatsAppLineId): 'primary' | 'secondary' {
  return line === 'commercial' ? 'secondary' : 'primary';
}

/** Color de texto de línea (hora no leída). `inboxLineHex` es ADN de relleno, no de texto. */
export function inboxLineForeground(theme: Theme, line: WhatsAppLineId): string {
  return theme.palette[inboxLineMuiColor(line)].main;
}

const iconCache: Partial<Record<WhatsAppLineId, string>> = {};

export function inboxNotificationIcon(line: WhatsAppLineId): string {
  const cached = iconCache[line];
  if (cached) return cached;
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = inboxLineHex(line);
  ctx.beginPath();
  ctx.arc(96, 96, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 92px system-ui, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(INBOX_LINE_DNA[line].letter, 96, 104);

  const dataUrl = canvas.toDataURL('image/png');
  iconCache[line] = dataUrl;
  return dataUrl;
}
