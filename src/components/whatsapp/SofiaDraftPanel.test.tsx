import '@/test/setup';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/config/supabase';
import { SofiaDraftPanel } from './SofiaDraftPanel';

const state = vi.hoisted(() => ({
  mode: 'supervisada',
  reads: 0,
  draft: null as null | { suggestion: string; suggestion_log_id: string | null; created_at: string },
  review: null as null | { verdict: string; feedback: string | null; created_at: string },
  rpcError: null as { message: string } | null,
  listeners: [] as Array<{ table: string; callback: (payload: unknown) => void }>,
}));

vi.mock('@/config/supabase', () => {
  function builder(read: () => unknown) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        state.reads += 1;
        return Promise.resolve({ data: read(), error: null });
      },
    };
    return chain;
  }
  const channel = {
    on: (_event: string, filter: { table: string }, callback: (payload: unknown) => void) => {
      state.listeners.push({ table: filter.table, callback });
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: (table: string) => builder(() => {
        if (table === 'sofia_settings') return { mode: state.mode };
        if (table === 'sofia_pending_drafts') return state.draft;
        if (table === 'sofia_draft_reviews') return state.review;
        return null;
      }),
      rpc: vi.fn(async () => ({ error: state.rpcError })),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

function renderPanel(onSend = vi.fn(async () => undefined)) {
  render(
    <ThemeProvider theme={createTheme()}>
      <SofiaDraftPanel stableKey="3001234567" onSend={onSend} />
    </ThemeProvider>,
  );
  return onSend;
}

describe('SofiaDraftPanel', () => {
  beforeEach(() => {
    state.mode = 'supervisada';
    state.reads = 0;
    state.draft = null;
    state.review = null;
    state.rpcError = null;
    state.listeners = [];
    vi.mocked(supabase.rpc).mockClear();
  });

  it('muestra un borrador que llega por Realtime y queda en Revisando', async () => {
    renderPanel();
    expect(screen.queryByText('Borrador de Sofía')).not.toBeInTheDocument();

    state.draft = {
      suggestion: 'Buenas tardes, ¿le agendo?',
      suggestion_log_id: null,
      created_at: '2026-11-20T15:00:00.000Z',
    };
    const listener = state.listeners.find((item) => item.table === 'sofia_pending_drafts');
    listener?.callback({ eventType: 'INSERT', new: state.draft, old: null });

    expect(await screen.findByDisplayValue('Buenas tardes, ¿le agendo?')).toBeInTheDocument();
    expect(screen.getByText('Revisando')).toBeInTheDocument();
  });

  it('avisa si el mensaje salió y el borrador no se cerró', async () => {
    const user = userEvent.setup();
    state.draft = {
      suggestion: 'Buenas tardes',
      suggestion_log_id: 'log-1',
      created_at: '2026-11-20T15:00:00.000Z',
    };
    state.rpcError = { message: 'no hay borrador' };
    const onSend = renderPanel();

    await screen.findByDisplayValue('Buenas tardes');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSend).toHaveBeenCalledWith('Buenas tardes');
    expect(await screen.findByText('El mensaje salió, pero el borrador no se cerró.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Buenas tardes')).toBeInTheDocument();
  });

  it('muestra el motivo cuando el envío falla', async () => {
    const user = userEvent.setup();
    state.draft = {
      suggestion: 'Buenas tardes',
      suggestion_log_id: null,
      created_at: '2026-11-20T15:00:00.000Z',
    };
    const notice = 'Este número está bloqueado por Decline. Quita esa etiqueta para poder escribir.';
    renderPanel(vi.fn(async () => {
      throw new Error(notice);
    }));

    await screen.findByDisplayValue('Buenas tardes');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText(notice)).toBeInTheDocument();
    expect(screen.queryByText('No se pudo enviar el mensaje.')).not.toBeInTheDocument();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('oculta el borrador cuando Sofía está apagada', async () => {
    state.mode = 'apagada';
    state.draft = {
      suggestion: 'Buenas tardes, ¿le agendo?',
      suggestion_log_id: null,
      created_at: '2026-11-20T15:00:00.000Z',
    };
    renderPanel();

    await waitFor(() => expect(state.reads).toBeGreaterThan(0));
    expect(screen.queryByDisplayValue('Buenas tardes, ¿le agendo?')).not.toBeInTheDocument();
    expect(screen.queryByText('Borrador de Sofía')).not.toBeInTheDocument();
  });
});
