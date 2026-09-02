import { describe, expect, it } from 'vitest';
import { DesignTokens } from '@/constants/designSystem';
import { darkTheme, lightTheme } from '@/theme/theme';
import {
  DIRECTORY_SHELL_HEX,
  DIRECTORY_TAB_HEX,
  DIRECTORY_TAB_INK_HEX,
  INBOX_LINE_DNA,
  inboxLineForeground,
  inboxLineHex,
  inboxLineLabel,
  inboxLineMuiColor,
} from './inboxLineVisual';

function srgbChannel(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('inboxLineVisual', () => {
  it('locks Bot to navy and Comercial to brand orange', () => {
    expect(inboxLineHex('bot')).toBe('#002446');
    expect(inboxLineHex('commercial')).toBe('#FF7700');
    expect(inboxLineHex('bot')).toBe(DesignTokens.brand.primary.blue);
    expect(inboxLineHex('commercial')).toBe(DesignTokens.brand.primary.orange);
    expect(inboxLineHex('bot')).toBe(DesignTokens.inboxLines.bot);
    expect(inboxLineHex('commercial')).toBe(DesignTokens.inboxLines.commercial);
  });

  it('keeps the directory shell on a distinct navy from Bot', () => {
    expect(DIRECTORY_SHELL_HEX).toBe('#003D73');
    expect(DIRECTORY_SHELL_HEX).not.toBe(inboxLineHex('bot'));
    expect(DIRECTORY_SHELL_HEX).not.toBe(inboxLineHex('commercial'));
  });

  it('paints the Directorio tab light green so it cannot read as Inbox Bot navy', () => {
    expect(DIRECTORY_TAB_HEX).toBe(DesignTokens.charts.lightGreen);
    expect(DIRECTORY_TAB_HEX).toBe('#81c784');
    expect(DIRECTORY_TAB_HEX).not.toBe(inboxLineHex('bot'));
    expect(DIRECTORY_TAB_HEX).not.toBe(DIRECTORY_SHELL_HEX);
    expect(relativeLuminance(DIRECTORY_TAB_HEX)).toBeGreaterThan(0.4);
    expect(relativeLuminance(inboxLineHex('bot'))).toBeLessThan(0.1);
    expect(contrastRatio(DIRECTORY_TAB_INK_HEX, DIRECTORY_TAB_HEX)).toBeGreaterThanOrEqual(4.5);
  });

  it('maps lines to MUI primary/secondary and readable labels', () => {
    expect(inboxLineMuiColor('bot')).toBe('primary');
    expect(inboxLineMuiColor('commercial')).toBe('secondary');
    expect(inboxLineLabel('bot')).toBe('Inbox Bot');
    expect(inboxLineLabel('commercial')).toBe('Inbox Comercial');
    expect(INBOX_LINE_DNA.bot.letter).toBe('B');
    expect(INBOX_LINE_DNA.commercial.letter).toBe('C');
  });

  it('keeps unread timestamp DNA on light paper and lifts it for dark contrast', () => {
    const darkPaper = DesignTokens.dark.background.paper;
    expect(contrastRatio(inboxLineHex('bot'), darkPaper)).toBeLessThan(4.5);
    expect(contrastRatio(inboxLineForeground(darkTheme, 'bot'), darkPaper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inboxLineForeground(darkTheme, 'commercial'), darkPaper)).toBeGreaterThanOrEqual(4.5);
    expect(inboxLineForeground(lightTheme, 'bot')).toBe(inboxLineHex('bot'));
    expect(inboxLineForeground(lightTheme, 'commercial')).toBe(inboxLineHex('commercial'));
  });
});
