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
      <MetricsShell vista="calidad" onVistaChange={onVistaChange}>
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

  it('does not render a global period control', () => {
    render(
      <MetricsShell vista="actividad" onVistaChange={vi.fn()}>
        <p>Vista actual</p>
      </MetricsShell>,
    );

    expect(screen.queryByRole('combobox', { name: 'Periodo' })).not.toBeInTheDocument();
  });

  it('opens with Resumen then Datos de la app', () => {
    render(
      <MetricsShell vista="resumen" onVistaChange={vi.fn()}>
        <p>Vista actual</p>
      </MetricsShell>,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAccessibleName('Operación: Resumen');
    expect(tabs[1]).toHaveAccessibleName('Operación: Datos de la app');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });
});
