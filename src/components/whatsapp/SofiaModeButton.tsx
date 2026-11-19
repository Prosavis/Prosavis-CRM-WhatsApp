import { useEffect, useState } from 'react';
import { Button, Stack } from '@mui/material';
import { supabase } from '@/config/supabase';

type SofiaMode = 'apagada' | 'supervisada';

const MODES: Array<{ value: SofiaMode; label: string }> = [
  { value: 'apagada', label: 'Apagada' },
  { value: 'supervisada', label: 'Supervisada' },
];

/**
 * Modo global de Sofía, visible en la cabecera del inbox del 312.
 * El servidor solo deja cambiarlo a Marian, Nicolás y Francy, y rechaza el modo sola.
 */
export function SofiaModeButton({ onError }: { onError: (message: string) => void }) {
  const [mode, setMode] = useState<SofiaMode>('apagada');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from('sofia_settings')
      .select('mode')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data?.mode === 'supervisada') setMode('supervisada');
      });
    return () => {
      active = false;
    };
  }, []);

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
    <Stack direction="row" spacing={0.5} aria-label="Modo de Sofía">
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
  );
}
