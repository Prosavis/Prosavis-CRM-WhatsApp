import { describe, expect, it } from 'vitest';
import {
  directoryNavMeta,
  formatDirectoryContactCount,
  inboxLineNavMeta,
  WHATSAPP_BOT_PHONE_DISPLAY,
  WHATSAPP_COMMERCIAL_PHONE_DISPLAY,
} from './whatsappInboxNav';

describe('whatsappInboxNav', () => {
  it('shows the bot number under Inbox Bot', () => {
    const meta = inboxLineNavMeta('bot');
    expect(meta.title).toBe('Inbox Bot');
    expect(meta.phone).toMatch(/312/);
    expect(meta.phone).toBe(WHATSAPP_BOT_PHONE_DISPLAY);
    expect(meta.ariaLabel).toContain(meta.phone);
  });

  it('shows the commercial number under Inbox Comercial', () => {
    const meta = inboxLineNavMeta('commercial');
    expect(meta.title).toBe('Inbox Comercial');
    expect(meta.phone).toMatch(/311/);
    expect(meta.phone).toBe(WHATSAPP_COMMERCIAL_PHONE_DISPLAY);
    expect(meta.ariaLabel).toContain(meta.phone);
  });

  it('puts the directory count below the title without parentheses', () => {
    const meta = directoryNavMeta(1234);
    expect(meta.title).toBe('Directorio');
    expect(formatDirectoryContactCount(1234)).toBe('1.234');
    expect(meta.count).toBe('1.234');
    expect(meta.count).not.toContain('(');
    expect(meta.count).not.toContain(')');
    expect(meta.ariaLabel).toContain(meta.count);
    expect(meta.ariaLabel).not.toMatch(/Directorio\s*\(/);
  });

  it('omits the count while the directory total is still loading', () => {
    const meta = directoryNavMeta(null);
    expect(meta.title).toBe('Directorio');
    expect(meta.count).toBe('');
    expect(meta.ariaLabel).toBe('Directorio');
  });
});
