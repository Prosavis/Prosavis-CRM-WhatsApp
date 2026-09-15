import '@/test/setup';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import WhatsAppTopBar from './WhatsAppTopBar';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { email: 'ops@prosavis.com' }, signOut: vi.fn() }),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ mode: 'light', toggleMode: vi.fn() }),
}));

vi.mock('./CompanyHandbookBook', () => ({ default: () => null }));
vi.mock('./CrmTutorialPlaceholder', () => ({ default: () => null }));
vi.mock('@/components/common/ThemeToggle', () => ({
  playThemeTransitionSound: () => undefined,
}));

function renderBar(onTabChange = () => undefined, phoneLayout = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string): MediaQueryList => ({
    matches: phoneLayout && (
      query.includes('max-width:599.95px') ||
      query.includes('orientation: landscape')
    ),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
  return render(
    <ThemeProvider theme={createTheme()}>
      <WhatsAppTopBar
        activeTab="inbox"
        onTabChange={onTabChange}
        directoryTotalContacts={1234}
      />
    </ThemeProvider>,
  );
}

describe('WhatsAppTopBar directory tab', () => {
  it('places Directorio between Comercial and Descuentos, without the green shell', () => {
    renderBar();

    const tabs = screen.getByTestId('whatsapp-tabs');
    const labels = within(tabs)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));

    expect(labels).toEqual([
      expect.stringContaining('Inbox Bot'),
      expect.stringContaining('Inbox Comercial'),
      'Directorio 1.234 contactos',
      'Descuentos',
    ]);

    const directory = screen.getByRole('button', { name: 'Directorio 1.234 contactos' });
    const discounts = screen.getByRole('button', { name: 'Descuentos' });
    expect(directory.parentElement).toBe(discounts.parentElement);
    expect(directory).toHaveTextContent('1.234');
  });

  it('offers the four primary mobile navigation destinations', () => {
    renderBar(() => undefined, true);

    const mobileNavigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    const labels = within(mobileNavigation)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    expect(labels).toEqual(['Bot', 'Comercial', 'Directorio', 'Más']);
  });

  it('keeps secondary modules in the mobile Más menu', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    renderBar(onTabChange, true);

    const mobileNavigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    await user.click(within(mobileNavigation).getByRole('button', { name: 'Más' }));
    await user.click(screen.getByRole('menuitem', { name: 'Métricas' }));

    expect(onTabChange).toHaveBeenCalledWith(expect.anything(), 'metrics');
  });
});
