import { describe, expect, it } from 'vitest';
import {
  getCompanyHandbookChapters,
  getHandbookChapter,
  HANDBOOK_CHAPTER_IDS,
  isHandbookChapterId,
} from './companyHandbook';

describe('companyHandbook', () => {
  it('exposes the five copy-paste chapters in order', () => {
    const ids = getCompanyHandbookChapters().map((chapter) => chapter.id);
    expect(ids).toEqual([...HANDBOOK_CHAPTER_IDS]);
    expect(ids).toEqual(['whatsapp', 'emails', 'web', 'social', 'house']);
  });

  it('lists Bot and Comercial as one row each with number and link', () => {
    const chapter = getHandbookChapter('whatsapp');
    expect(chapter?.entries).toHaveLength(3);
    const bot = chapter?.entries.find((entry) => entry.id === 'wa-bot');
    const commercial = chapter?.entries.find((entry) => entry.id === 'wa-commercial');
    expect(bot?.label).toBe('Bot');
    expect(bot?.copyText).toMatch(/312/);
    expect(bot?.linkCopyText).toContain('wa.me');
    expect(commercial?.label).toBe('Comercial');
    expect(commercial?.copyText).toMatch(/311/);
    expect(commercial?.linkCopyText).toContain('wa.me');
  });

  it('lists the official emails', () => {
    const copies = getHandbookChapter('emails')?.entries.map((entry) => entry.copyText) ?? [];
    expect(copies).toContain('comercial@prosavis.com');
    expect(copies).toContain('support@prosavis.com');
  });

  it('lists social handles from the brand channels', () => {
    const social = getHandbookChapter('social');
    expect(social?.entries.find((entry) => entry.id === 'social-ig')?.handle).toBe(
      '@prosavis.app',
    );
    expect(social?.entries.every((entry) => Boolean(entry.iconSrc))).toBe(true);
    expect(social?.entries.map((entry) => entry.label)).toEqual([
      'Instagram',
      'TikTok',
      'Facebook',
      'X',
      'YouTube',
      'LinkedIn',
    ]);
  });

  it('lists legal house data for proposals', () => {
    const house = getHandbookChapter('house');
    expect(house?.entries.find((entry) => entry.id === 'house-nit')?.copyText).toBe('902027137-1');
    expect(house?.entries.find((entry) => entry.id === 'house-legal')?.copyText).toBe('PROSAVIS SAS');
  });

  it('rejects unknown chapter ids', () => {
    expect(isHandbookChapterId('whatsapp')).toBe(true);
    expect(isHandbookChapterId('tutorial')).toBe(false);
    expect(getHandbookChapter('whatsapp')?.title).toBe('WhatsApp');
  });
});
