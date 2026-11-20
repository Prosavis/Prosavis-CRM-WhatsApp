import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { supabase } from '@/config/supabase';
import { openPostgresChannel } from '@/utils/inboxRealtimeSync';

type SofiaMode = 'apagada' | 'supervisada' | 'sola';

interface ModeChange {
  actor_email: string | null;
  changed_at: string;
}

const MODES: Array<{ value: SofiaMode; label: string }> = [
  { value: 'apagada', label: 'Apagada' },
  { value: 'supervisada', label: 'Supervisada' },
  { value: 'sola', label: 'Automática' },
];

const SUPERVISED_WARNING = 'Fuera de horario Sofía envía sola el mensaje puente a la clienta. Los borradores siempre los envía una persona.';
const AUTOMATIC_WARNING = 'Sofía va a escribirles a clientas reales, agendar la cita si hay cupo y dejar el pago pendiente.';

function modeLabel(mode: SofiaMode): string {
  switch (mode) {
    case 'apagada':
      return 'apagada';
    case 'supervisada':
      return 'supervisada';
    case 'sola':
      return 'automática';
    default: {
      const never: never = mode;
      return never;
    }
  }
}

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
  const key = `sofia-modo-aviso:${ymd}:${slot}:${mode}`;
  try {
    if (window.localStorage.getItem(key)) return null;
    window.localStorage.setItem(key, '1');
  } catch {
    return null;
  }
  const where = mode === 'sola'
    ? 'Contesta, agenda y deja el pago pendiente.'
    : slot === 'cierre'
      ? 'Fuera del horario de oficina solo sale el mensaje puente.'
      : 'En horario de oficina el borrador espera a que alguien lo envíe.';
  return `Sofía está ${modeLabel(mode)}. ${where}`;
}

function actorLabel(email: string | null): string {
  if (email === 'admin@prosavis.com') return 'Marian';
  if (email === 'support@prosavis.com') return 'Nicolás';
  if (email === 'francyoliverab@gmail.com') return 'Francy';
  return email ?? 'Alguien';
}

function formatModeChange(change: ModeChange | null): string | null {
  if (!change?.changed_at) return null;
  const when = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(change.changed_at));
  return `${actorLabel(change.actor_email)} · ${when}`;
}

type ModeFailure = 'permiso' | 'modo' | 'servidor';

function classifyModeError(error: { message?: string; code?: string }): ModeFailure {
  const message = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';
  if (code === '42501' || message.includes('sin permiso')) return 'permiso';
  if (code === '22023' || message.includes('modo no permitido')) return 'modo';
  return 'servidor';
}

export function sofiaModeErrorText(error: { message?: string; code?: string }): string {
  const kind = classifyModeError(error);
  switch (kind) {
    case 'permiso':
      return 'Sin permiso para cambiar el modo de Sofía.';
    case 'modo':
      return 'Ese modo no está permitido.';
    case 'servidor':
      return 'Falla del servidor al cambiar el modo de Sofía.';
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

async function readSofiaMode(): Promise<{ mode: SofiaMode; change: ModeChange | null } | null> {
  const [settings, events] = await Promise.all([
    supabase.from('sofia_settings').select('mode').eq('id', 1).maybeSingle(),
    supabase
      .from('sofia_mode_events')
      .select('actor_email, changed_at')
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const mode = settings.data?.mode;
  if (settings.error || (mode !== 'apagada' && mode !== 'supervisada' && mode !== 'sola')) return null;
  const row = events.error ? null : events.data;
  return {
    mode,
    change: row?.changed_at
      ? { actor_email: row.actor_email ?? null, changed_at: row.changed_at }
      : null,
  };
}

/**
 * Modo global de Sofía, visible en la cabecera del inbox del 312.
 * El servidor solo deja cambiarlo a Marian, Nicolás y Francy.
 * Automática guarda el valor sola y no se enciende sola.
 */
export function SofiaModeButton({ onError }: { onError: (message: string) => void }) {
  const [mode, setMode] = useState<SofiaMode>('apagada');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [change, setChange] = useState<ModeChange | null>(null);
  const [confirmMode, setConfirmMode] = useState<Exclude<SofiaMode, 'apagada'> | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await readSofiaMode();
      if (!active || !next) return;
      setMode(next.mode);
      setChange(next.change);
      setReady(true);
    };
    void load();
    const unsubscribe = openPostgresChannel({
      client: supabase,
      baseName: 'sofia-mode',
      bindings: [
        {
          filter: { event: '*', schema: 'public', table: 'sofia_settings', filter: 'id=eq.1' },
          callback: () => { void load(); },
        },
        {
          filter: { event: 'INSERT', schema: 'public', table: 'sofia_mode_events' },
          callback: () => { void load(); },
        },
      ],
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setNotice(dayNotice(mode));
  }, [ready, mode]);

  const apply = async (next: SofiaMode) => {
    setConfirmMode(null);
    setBusy(true);
    const { error } = await supabase.rpc('set_sofia_mode', { next_mode: next });
    if (error) {
      onError(sofiaModeErrorText(error));
      const fresh = await readSofiaMode();
      if (fresh) {
        setMode(fresh.mode);
        setChange(fresh.change);
      }
      setBusy(false);
      return;
    }
    setMode(next);
    const fresh = await readSofiaMode();
    if (fresh) {
      setMode(fresh.mode);
      setChange(fresh.change);
    }
    setBusy(false);
  };

  const changeMode = (next: SofiaMode) => {
    if (next === mode || busy) return;
    if (next === 'supervisada' || next === 'sola') {
      setConfirmMode(next);
      return;
    }
    void apply(next);
  };

  const confirmCopy = (next: Exclude<SofiaMode, 'apagada'>): { title: string; body: string; action: string } => {
    switch (next) {
      case 'supervisada':
        return { title: 'Pasar a supervisada', body: SUPERVISED_WARNING, action: 'Pasar a supervisada' };
      case 'sola':
        return { title: 'Pasar a automática', body: AUTOMATIC_WARNING, action: 'Pasar a automática' };
      default: {
        const never: never = next;
        return never;
      }
    }
  };
  const pending = confirmMode ? confirmCopy(confirmMode) : null;

  const who = formatModeChange(change);

  return (
    <Stack spacing={0.25} aria-label="Modo de Sofía">
      <Stack direction="row" spacing={0.5}>
        {MODES.map((option) => (
          <Button
            key={option.value}
            size="small"
            variant={mode === option.value ? 'contained' : 'text'}
            aria-pressed={mode === option.value}
            disabled={busy}
            onClick={() => changeMode(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </Stack>
      {who ? (
        <Typography variant="caption" color="text.secondary">{who}</Typography>
      ) : null}
      {notice ? (
        <Typography variant="caption" color="text.secondary">{notice}</Typography>
      ) : null}
      <Dialog open={pending !== null} onClose={() => setConfirmMode(null)}>
        <DialogTitle>{pending?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{pending?.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmMode(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => { if (confirmMode) void apply(confirmMode); }}
          >
            {pending?.action}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
