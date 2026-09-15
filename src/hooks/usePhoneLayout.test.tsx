import '@/test/setup';
import type { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import { usePhoneLayout } from './usePhoneLayout';

const theme = createTheme();

function TestThemeWrapper({ children }: PropsWithChildren) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

function mockMediaQuery(matches: (query: string) => boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string): MediaQueryList => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

describe('usePhoneLayout', () => {
  it('keeps single-pane navigation on a coarse-pointer landscape phone', () => {
    mockMediaQuery((query) => query.includes('orientation: landscape'));

    const { result } = renderHook(() => usePhoneLayout(), { wrapper: TestThemeWrapper });

    expect(result.current).toBe(true);
  });

  it('keeps tablet and desktop widths in multipanel mode', () => {
    mockMediaQuery(() => false);

    const { result } = renderHook(() => usePhoneLayout(), { wrapper: TestThemeWrapper });

    expect(result.current).toBe(false);
  });
});
