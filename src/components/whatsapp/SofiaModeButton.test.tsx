import '@/test/setup';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/config/supabase';
import { SofiaModeButton, sofiaModeErrorText } from './SofiaModeButton';

const state = vi.hoisted(() => ({
  mode: 'apagada',
  event: {
    actor_email: 'support@prosavis.com',
    changed_at: '2026-11-20T14:26:51.000Z',
  } as { actor_email: string | null; changed_at: string } | null,
  rpcError: null as { message: string; code: string } | null,
}));

vi.mock('@/config/supabase', () => {
  function builder(read: () => unknown) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: read(), error: null }),
    };
    return chain;
  }
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: (table: string) => builder(() => (
        table === 'sofia_settings' ? { mode: state.mode } : state.event
      )),
      rpc: vi.fn(async () => ({ error: state.rpcError })),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

function renderButton(onError = vi.fn()) {
  render(
    <ThemeProvider theme={createTheme()}>
      <SofiaModeButton onError={onError} />
    </ThemeProvider>,
  );
  return onError;
}

describe('SofiaModeButton', () => {
  beforeEach(() => {
    state.mode = 'apagada';
    state.rpcError = null;
    vi.mocked(supabase.rpc).mockClear();
  });

  it('muestra quién cambió el modo', async () => {
    renderButton();
    expect(await screen.findByText(/Nicolás/)).toBeInTheDocument();
  });

  it('pide confirmación antes de supervisada y muestra el motivo si no hay permiso', async () => {
    const user = userEvent.setup();
    state.rpcError = { message: 'sin permiso para cambiar el modo', code: '42501' };
    const onError = renderButton();

    await user.click(screen.getByRole('button', { name: 'Supervisada' }));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(screen.getByText('Fuera de horario Sofía envía sola el mensaje puente a la clienta. Los borradores siempre los envía una persona.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pasar a supervisada' }));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Sin permiso para cambiar el modo de Sofía.');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Apagada' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pide confirmación antes de automática y no la enciende al primer clic', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByRole('button', { name: 'Automática' }));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(screen.getByText('Sofía va a escribirles a clientas reales, agendar la cita si hay cupo y dejar el pago pendiente.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pasar a automática' }));
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('set_sofia_mode', { next_mode: 'sola' });
    });
  });

  it('distingue modo no permitido y falla del servidor', () => {
    expect(sofiaModeErrorText({ message: 'modo no permitido en esta fase', code: '22023' }))
      .toBe('Ese modo no está permitido.');
    expect(sofiaModeErrorText({ message: 'connection reset', code: 'XX000' }))
      .toBe('Falla del servidor al cambiar el modo de Sofía.');
  });
});
