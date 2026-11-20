import '@/test/setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/config/supabase';
import { SofiaMonitor, sofiaNowCopy } from './SofiaMonitor';

const state = vi.hoisted(() => ({
  inOffice: true,
  calls: [] as string[],
  snapshot: {
    modo: 'supervisada',
    cola: [{
      nombre: 'Dulce Encanto Spa',
      hace_minutos: 3,
      linea: 'Buenas tardes, le confirmo la visita',
      veredicto: null,
      chat: '573001112233',
    }],
    puentes: [{
      nombre: 'Casa Verde',
      enviado: '2026-11-20T19:10:00.000Z',
      chat: '573009998877',
    }],
  } as Record<string, unknown>,
}));

vi.mock('../../../supabase/functions/_shared/sofiaTeamHours', () => ({
  teamIsInOffice: () => state.inOffice,
}));

vi.mock('@/config/supabase', () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: {
      rpc: vi.fn(async (name: string) => {
        state.calls.push(name);
        if (name === 'sofia_vaciar_cola') return { data: 1, error: null };
        return { data: state.snapshot, error: null };
      }),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

function renderMonitor() {
  render(
    <ThemeProvider theme={createTheme()}>
      <SofiaMonitor />
    </ThemeProvider>,
  );
}

describe('SofiaMonitor', () => {
  beforeEach(() => {
    state.inOffice = true;
    state.calls = [];
    state.snapshot = {
      modo: 'supervisada',
      cola: [{
        nombre: 'Dulce Encanto Spa',
        hace_minutos: 3,
        linea: 'Buenas tardes, le confirmo la visita',
        veredicto: null,
        chat: '573001112233',
      }],
      puentes: [{
        nombre: 'Casa Verde',
        enviado: '2026-11-20T19:10:00.000Z',
        chat: '573009998877',
      }],
    };
    vi.mocked(supabase.rpc).mockClear();
  });

  it('muestra el nombre, el veredicto y la hora del puente, sin el teléfono', async () => {
    const user = userEvent.setup();
    renderMonitor();
    await user.click(screen.getByRole('button', { name: 'Sofía ahora' }));

    expect(await screen.findByText('Dulce Encanto Spa')).toBeInTheDocument();
    expect(screen.getByText('Revisando')).toBeInTheDocument();
    expect(screen.getByText('Buenas tardes, le confirmo la visita')).toBeInTheDocument();
    expect(screen.getByText(/Casa Verde · 14:10/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('573001112233');
    expect(document.body.textContent).not.toContain('573009998877');
    expect(screen.getByText(/una persona lo envía/)).toBeInTheDocument();
  });

  it('ofrece vaciar la cola cuando está apagada y quedaron borradores', async () => {
    const user = userEvent.setup();
    state.snapshot = { ...state.snapshot, modo: 'apagada' };
    renderMonitor();
    await user.click(screen.getByRole('button', { name: 'Sofía ahora' }));

    expect(await screen.findByText('Quedaron borradores con Sofía apagada.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dejar la cola en cero' }));
    expect(state.calls).toContain('sofia_vaciar_cola');
  });

  it('dice qué puede salir sola según el modo y el horario', () => {
    expect(sofiaNowCopy('apagada', true)).toBe('Sofía está apagada. No lee ni envía.');
    expect(sofiaNowCopy('supervisada', true)).toContain('No sale nada sola.');
    expect(sofiaNowCopy('supervisada', false)).toContain('El único mensaje que sale solo es el puente');
    expect(sofiaNowCopy('supervisada', false)).toContain('los envía una persona');
    expect(sofiaNowCopy('sola', false)).toContain('Contesta y agenda');
    expect(sofiaNowCopy('sola', false)).toContain('Francy y a Marian');
  });
});
