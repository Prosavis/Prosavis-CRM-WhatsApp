import '@/test/setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DirectoryWorkspaceKpisBar } from './DirectoryWorkspaceKpis';

const kpis = {
  total: 10,
  scheduled: 7,
  canceledOrRejected: 3,
  recurring: 2,
  reactivation: 1,
};

describe('DirectoryWorkspaceKpisBar', () => {
  it('renders the five actionable KPIs and selects the matching card', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DirectoryWorkspaceKpisBar
        kpis={kpis}
        view="scheduled"
        segment={null}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId('directory-kpi-total')).toHaveTextContent('10');
    expect(screen.getByTestId('directory-kpi-scheduled')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('directory-kpi-canceledOrRejected')).toHaveTextContent('3');
    await user.click(screen.getByTestId('directory-kpi-recurring'));
    expect(onSelect).toHaveBeenCalledWith({ view: 'all', segment: 'recurring' });
  });

  it('shows the error state without hiding the cards', () => {
    render(
      <DirectoryWorkspaceKpisBar
        error="No se pudo cargar el directorio."
        view="all"
        segment={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('No se pudo cargar el directorio.')).toBeInTheDocument();
    expect(screen.getByTestId('directory-kpi-total')).toHaveTextContent('0');
  });
});
