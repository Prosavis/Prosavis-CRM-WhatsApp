import '@/test/setup';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewportHeight } from './useVisualViewportHeight';

class TestVisualViewport extends EventTarget {
  height = 844;
}

describe('useVisualViewportHeight', () => {
  const visualViewport = new TestVisualViewport();

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--crm-viewport-height');
    vi.restoreAllMocks();
  });

  it('tracks the visible viewport height used by the mobile shell', () => {
    const { unmount } = renderHook(() => useVisualViewportHeight());

    expect(
      document.documentElement.style.getPropertyValue('--crm-viewport-height'),
    ).toBe('844px');

    visualViewport.height = 667;
    visualViewport.dispatchEvent(new Event('resize'));

    expect(
      document.documentElement.style.getPropertyValue('--crm-viewport-height'),
    ).toBe('667px');

    unmount();
    expect(
      document.documentElement.style.getPropertyValue('--crm-viewport-height'),
    ).toBe('');
  });
});
