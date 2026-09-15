import '@/test/setup';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';

const phoneLayout = vi.hoisted(() => ({ current: false }));

vi.mock('@/hooks/usePhoneLayout', () => ({
  usePhoneLayout: () => phoneLayout.current,
}));

vi.mock('@/hooks/useVisualViewportHeight', () => ({
  useVisualViewportHeight: () => undefined,
}));

describe('AppShell', () => {
  afterEach(() => {
    phoneLayout.current = false;
  });

  it('lets the visual viewport shrink on phones instead of clamping to 100vh', () => {
    phoneLayout.current = true;
    document.documentElement.style.setProperty('--crm-viewport-height', '520px');

    render(
      <AppShell>
        <div>inbox</div>
      </AppShell>,
    );

    expect(screen.getByTestId('crm-app-shell')).toHaveStyle({
      minHeight: '0px',
      height: 'var(--crm-viewport-height, 100dvh)',
    });
  });

  it('keeps the desktop shell on a normal document flow', () => {
    render(
      <AppShell>
        <div>inbox</div>
      </AppShell>,
    );

    const shell = screen.getByTestId('crm-app-shell');
    expect(shell).toHaveStyle({ height: 'auto' });
    expect(window.getComputedStyle(shell).minHeight).not.toBe('0px');
  });
});
