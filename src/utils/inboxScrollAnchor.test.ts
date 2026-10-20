import { describe, expect, it } from 'vitest';
import {
  INBOX_SCROLL_EDGE_PX,
  isScrolledAwayFromBottom,
  isScrolledAwayFromTop,
} from './inboxScrollAnchor';

describe('inboxScrollAnchor', () => {
  it('treats the bottom edge as caught up', () => {
    expect(isScrolledAwayFromBottom({
      scrollHeight: 800,
      scrollTop: 400,
      clientHeight: 400,
    })).toBe(false);
    expect(isScrolledAwayFromBottom({
      scrollHeight: 800,
      scrollTop: 320,
      clientHeight: 400,
    })).toBe(false);
  });

  it('shows the jump control once the reader leaves the edge', () => {
    expect(isScrolledAwayFromBottom({
      scrollHeight: 800,
      scrollTop: 300,
      clientHeight: 400,
    }, INBOX_SCROLL_EDGE_PX)).toBe(true);
    expect(isScrolledAwayFromTop(INBOX_SCROLL_EDGE_PX)).toBe(false);
    expect(isScrolledAwayFromTop(INBOX_SCROLL_EDGE_PX + 1)).toBe(true);
  });
});
