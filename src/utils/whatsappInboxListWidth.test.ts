import { describe, expect, it } from 'vitest';
import {
  clampInboxListWidth,
  INBOX_LIST_WIDTH_DEFAULT,
  INBOX_LIST_WIDTH_MAX,
  INBOX_LIST_WIDTH_MIN,
  parseInboxListWidth,
} from './whatsappInboxListWidth';

describe('whatsappInboxListWidth', () => {
  it('keeps a width inside the allowed range', () => {
    expect(clampInboxListWidth(320)).toBe(320);
    expect(clampInboxListWidth(400.4)).toBe(400);
  });

  it('clamps a width that is too narrow or too wide', () => {
    expect(clampInboxListWidth(120)).toBe(INBOX_LIST_WIDTH_MIN);
    expect(clampInboxListWidth(900)).toBe(INBOX_LIST_WIDTH_MAX);
  });

  it('falls back to the default for garbage values', () => {
    expect(clampInboxListWidth(Number.NaN)).toBe(INBOX_LIST_WIDTH_DEFAULT);
    expect(parseInboxListWidth(null)).toBe(INBOX_LIST_WIDTH_DEFAULT);
    expect(parseInboxListWidth('')).toBe(INBOX_LIST_WIDTH_DEFAULT);
    expect(parseInboxListWidth('nope')).toBe(INBOX_LIST_WIDTH_DEFAULT);
  });

  it('parses a stored number and still clamps it', () => {
    expect(parseInboxListWidth('360')).toBe(360);
    expect(parseInboxListWidth('80')).toBe(INBOX_LIST_WIDTH_MIN);
    expect(parseInboxListWidth('2000')).toBe(INBOX_LIST_WIDTH_MAX);
  });
});
