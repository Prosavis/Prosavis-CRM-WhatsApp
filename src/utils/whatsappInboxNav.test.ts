import { describe, expect, it } from 'vitest';
import {
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
});
