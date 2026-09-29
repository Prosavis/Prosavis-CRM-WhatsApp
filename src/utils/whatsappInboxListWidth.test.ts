import { describe, expect, it } from 'vitest';
import {
  clampInboxListWidth,
  inboxListWidthForViewport,
  INBOX_LIST_RATIO_DEFAULT,
  INBOX_LIST_RATIO_MAX,
  INBOX_LIST_WIDTH_DEFAULT,
  INBOX_LIST_WIDTH_MAX,
  INBOX_LIST_WIDTH_MIN,
  parseInboxListRatio,
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

  it('keeps a fraction of the viewport so zoom changes the list width', () => {
    expect(inboxListWidthForViewport(INBOX_LIST_RATIO_DEFAULT, 1440)).toBe(INBOX_LIST_WIDTH_DEFAULT);
    expect(inboxListWidthForViewport(INBOX_LIST_RATIO_DEFAULT, 2880)).toBe(640);
    expect(inboxListWidthForViewport(0.05, 1000)).toBe(INBOX_LIST_WIDTH_MIN);
    expect(inboxListWidthForViewport(0.9, 1000)).toBe(Math.round(1000 * INBOX_LIST_RATIO_MAX));
  });

  it('reads a legacy pixel width as a ratio of a 1440px viewport', () => {
    expect(parseInboxListRatio('320')).toBeCloseTo(INBOX_LIST_RATIO_DEFAULT);
    expect(parseInboxListRatio('0.3')).toBeCloseTo(0.3);
    expect(parseInboxListRatio('2000')).toBeCloseTo(INBOX_LIST_RATIO_MAX);
    expect(parseInboxListRatio(null)).toBe(INBOX_LIST_RATIO_DEFAULT);
    expect(parseInboxListRatio('nope')).toBe(INBOX_LIST_RATIO_DEFAULT);
  });
});
