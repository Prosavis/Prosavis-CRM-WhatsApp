import '@/test/setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MetricsShell from './MetricsShell';

describe('MetricsShell', () => {
  it('exposes named tabs and updates the selected analysis view', async () => {
    const user = userEvent.setup();
    const onVistaChange = vi.fn();
    render(
      <MetricsShell
        vista="calidad"
        days={30}
        onVistaChange={onVistaChange}
        onDaysChange={vi.fn()}
      >
        <p>Vista actual</p>
      </MetricsShell>,
    );

    expect(
      screen.getByRole('tablist', { name: 'Vistas de métricas operativas' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Clientes: Calidad' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'Operación: Mapa' }));
    expect(onVistaChange).toHaveBeenCalledWith('mapa');
  });

  it('keeps the global period in one labelled control', async () => {
    const user = userEvent.setup();
    const onDaysChange = vi.fn();
    render(
      <MetricsShell
        vista="actividad"
        days={30}
        onVistaChange={vi.fn()}
        onDaysChange={onDaysChange}
      >
        <p>Vista actual</p>
      </MetricsShell>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Periodo' }));
    await user.click(screen.getByRole('option', { name: '60 días' }));
    expect(onDaysChange).toHaveBeenCalledWith(60);
  });
});
