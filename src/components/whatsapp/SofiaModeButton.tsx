import { useEffect, useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { supabase } from '@/config/supabase';

type SofiaMode = 'apagada' | 'supervisada';

const MODES: Array<{ value: SofiaMode; label: string }> = [
  { value: 'apagada', label: 'Apagada' },
  { value: 'supervisada', label: 'Supervisada' },
];

function dayNotice(mode: SofiaMode): string | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const ymd = `${byType.year}-${byType.month}-${byType.day}`;
  const hour = Number(byType.hour ?? '0');
  const slot = hour >= 18 || hour < 8 ? 'cierre' : 'apertura';
  const key = `sofia-modo-aviso:${ymd}:${slot}`;
  try {
    if (window.localStorage.getItem(key)) return null;
    window.localStorage.setItem(key, '1');
  } catch {
    return null;
  }
  const where = slot === 'cierre'
    ? 'Fuera del horario de oficina solo sale el mensaje puente.'
    : 'En horario de oficina el borrador espera a que alguien lo envíe.';
  return `Sofía está ${mode}. ${where}`;
}

/**
 * Modo global de Sofía, visible en la cabecera del inbox del 312.
 * El servidor solo deja cambiarlo a Marian, Nicolás y Francy, y rechaza el modo sola.
 */
export function SofiaModeButton({ onError }: { onError: (message: string) => void }) {
  const [mode, setMode] = useState<SofiaMode>('apagada');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('sofia_settings')
      .select('mode')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data?.mode === 'supervisada') setMode('supervisada');
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setNotice(dayNotice(mode));
  }, [ready, mode]);

  const change = async (next: SofiaMode) => {
    if (next === mode || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_sofia_mode', { next_mode: next });
    setBusy(false);
    if (error) {
      onError('No se pudo cambiar el modo de Sofía.');
      return;
    }
    setMode(next);
  };

  return (
    <Stack spacing={0.25} aria-label="Modo de Sofía">
      <Stack direction="row" spacing={0.5}>
        {MODES.map((option) => (
          <Button
            key={option.value}
            size="small"
            variant={mode === option.value ? 'contained' : 'text'}
            disabled={busy}
            onClick={() => change(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </Stack>
      {notice ? (
        <Typography variant="caption" color="text.secondary">{notice}</Typography>
      ) : null}
    </Stack>
  );
}
