import '@/test/setup';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MetricsPageState from './MetricsPageState';

describe('MetricsPageState', () => {
  it('does not render false zero content when a query failed', () => {
    render(
      <MetricsPageState loading={false} error="Red no disponible">
        <div>Total: 0</div>
      </MetricsPageState>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Red no disponible');
    expect(screen.queryByText('Total: 0')).not.toBeInTheDocument();
  });

  it('offers a retry action for recoverable errors', () => {
    const onRetry = vi.fn();
    render(
      <MetricsPageState loading={false} error="Falló la consulta" onRetry={onRetry}>
        <div />
      </MetricsPageState>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('announces loading and an orienting empty state', () => {
    const { rerender } = render(
      <MetricsPageState loading error={null}>
        <div />
      </MetricsPageState>,
    );
    expect(screen.getByRole('status', { name: 'Cargando métricas' })).toBeInTheDocument();

    rerender(
      <MetricsPageState loading={false} empty error={null}>
        <div />
      </MetricsPageState>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Amplía el periodo');
  });
});
