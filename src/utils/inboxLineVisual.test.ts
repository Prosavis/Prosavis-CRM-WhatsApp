import { describe, expect, it } from 'vitest';
import { DesignTokens } from '@/constants/designSystem';
import {
  DIRECTORY_SHELL_HEX,
  INBOX_LINE_DNA,
  inboxLineHex,
  inboxLineLabel,
  inboxLineMuiColor,
} from './inboxLineVisual';

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

  it('maps lines to MUI primary/secondary and readable labels', () => {
    expect(inboxLineMuiColor('bot')).toBe('primary');
    expect(inboxLineMuiColor('commercial')).toBe('secondary');
    expect(inboxLineLabel('bot')).toBe('Inbox Bot');
    expect(inboxLineLabel('commercial')).toBe('Inbox Comercial');
    expect(INBOX_LINE_DNA.bot.letter).toBe('B');
    expect(INBOX_LINE_DNA.commercial.letter).toBe('C');
  });
});
