import '@/test/setup';
import { render, screen, within } from '@testing-library/react';
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

function renderBar() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <WhatsAppTopBar
        activeTab="inbox"
        onTabChange={() => undefined}
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
});
