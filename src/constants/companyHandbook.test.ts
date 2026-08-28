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

  it('lists the three WhatsApp lines and the bot link', () => {
    const chapter = getHandbookChapter('whatsapp');
    const copies = chapter?.entries.map((entry) => entry.copyText).join(' ') ?? '';
    expect(copies).toMatch(/312/);
    expect(copies).toMatch(/311/);
    expect(copies).toMatch(/324/);
    expect(chapter?.entries.some((entry) => entry.copyText.includes('wa.me'))).toBe(true);
  });

  it('lists the official emails', () => {
    const copies = getHandbookChapter('emails')?.entries.map((entry) => entry.copyText) ?? [];
    expect(copies).toContain('comercial@prosavis.com');
    expect(copies).toContain('support@prosavis.com');
  });

  it('lists social handles from the brand channels', () => {
    const social = getHandbookChapter('social');
    expect(social?.entries.find((entry) => entry.id === 'social-ig')?.description).toBe(
      '@prosavis.app',
    );
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
