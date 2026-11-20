import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  IconButton,
  Popover,
  Stack,
  Typography,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { supabase } from '@/config/supabase';
import { dispatchWhatsAppFocusChat } from '@/utils/desktopNotifications';
import { openPostgresChannel } from '@/utils/inboxRealtimeSync';
import { teamIsInOffice } from '../../../supabase/functions/_shared/sofiaTeamHours';

const POLL_MS = 20_000;

type SofiaMode = 'apagada' | 'supervisada' | 'sola';
type Verdict = 'aprobar' | 'devolver' | 'riesgo';

export interface SofiaQueueItem {
  nombre: string;
  haceMinutos: number;
  linea: string;
  veredicto: Verdict | null;
  chat: string;
}

export interface SofiaBridgeItem {
  nombre: string;
  enviado: string;
  chat: string;
}

export interface SofiaMonitorSnapshot {
  modo: SofiaMode;
  noLeidos: number;
  enPasada: number;
  ventanaCerrada: number;
  ultimoNuestro: number;
  silencioCorto: number;
  pausados: number;
  cola: SofiaQueueItem[];
  puentes: SofiaBridgeItem[];
}

export function sofiaNowCopy(mode: SofiaMode, inOffice: boolean): string {
  switch (mode) {
    case 'apagada':
      return 'Sofía está apagada. No lee ni envía.';
    case 'supervisada':
      return inOffice
        ? 'Sofía está en supervisada, en horario de oficina. Deja el borrador y una persona lo envía. No sale nada sola.'
        : 'Sofía está en supervisada, fuera de horario. El único mensaje que sale solo es el puente, uno por chat y por día. La cita, el precio y el horario los envía una persona.';
    case 'sola':
      return 'Sofía está en automática. Contesta y agenda. El pago queda pendiente. Lo que no puede resolver se lo avisa a Francy y a Marian.';
    default: {
      const never: never = mode;
      return never;
    }
  }
}

function verdictLabel(verdict: Verdict | null): string {
  switch (verdict) {
    case null:
      return 'Revisando';
    case 'aprobar':
      return 'Aprobar';
    case 'devolver':
      return 'Devolver';
    case 'riesgo':
      return 'Riesgo';
    default: {
      const never: never = verdict;
      return never;
    }
  }
}

function countOf(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function sofiaPileCopy(snapshot: Pick<
  SofiaMonitorSnapshot,
  'noLeidos' | 'enPasada' | 'ventanaCerrada' | 'ultimoNuestro' | 'silencioCorto' | 'pausados'
>): string {
  const reasons = [
    snapshot.silencioCorto > 0 ? `${snapshot.silencioCorto} todavía en silencio` : '',
    snapshot.ultimoNuestro > 0 ? `${snapshot.ultimoNuestro} con nuestro mensaje de último` : '',
    snapshot.ventanaCerrada > 0 ? `${snapshot.ventanaCerrada} con la ventana cerrada` : '',
    snapshot.pausados > 0 ? `${snapshot.pausados} en pausa` : '',
  ].filter((reason) => reason.length > 0);
  const tail = reasons.length > 0 ? ` Fuera: ${reasons.join(', ')}.` : '';
  return `El inbox tiene ${snapshot.noLeidos} no leídos. Entran ${snapshot.enPasada}.${tail}`;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asVerdict(value: unknown): Verdict | null {
  if (value === 'aprobar' || value === 'devolver' || value === 'riesgo') return value;
  return null;
}

function readQueue(value: unknown): SofiaQueueItem[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const chat = asText(row.chat);
  const nombre = asText(row.nombre) || 'Sin nombre';
  if (!chat) return [];
  const minutes = typeof row.hace_minutos === 'number' ? row.hace_minutos : Number(row.hace_minutos);
  return [{
    nombre,
    haceMinutos: Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0,
    linea: asText(row.linea),
    veredicto: asVerdict(row.veredicto),
    chat,
  }];
}

function readBridge(value: unknown): SofiaBridgeItem[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const chat = asText(row.chat);
  const enviado = asText(row.enviado);
  if (!chat || !enviado) return [];
  return [{
    nombre: asText(row.nombre) || 'Sin nombre',
    enviado,
    chat,
  }];
}

export function readSofiaMonitor(raw: unknown): SofiaMonitorSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const modo = record.modo === 'supervisada' || record.modo === 'apagada' || record.modo === 'sola'
    ? record.modo
    : null;
  if (!modo) return null;
  return {
    modo,
    noLeidos: countOf(record.no_leidos),
    enPasada: countOf(record.en_pasada),
    ventanaCerrada: countOf(record.ventana_cerrada),
    ultimoNuestro: countOf(record.ultimo_nuestro),
    silencioCorto: countOf(record.silencio_corto),
    pausados: countOf(record.pausados),
    cola: Array.isArray(record.cola) ? record.cola.flatMap(readQueue) : [],
    puentes: Array.isArray(record.puentes) ? record.puentes.flatMap(readBridge) : [],
  };
}

function ageLabel(minutes: number): string {
  if (minutes < 1) return 'ahora';
  if (minutes === 1) return 'hace 1 min';
  return `hace ${minutes} min`;
}

function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function SofiaMonitor() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<SofiaMonitorSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('sofia_monitor');
    const next = error ? null : readSofiaMonitor(data);
    setFailed(Boolean(error) || !next);
    if (next) setSnapshot(next);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await load();
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    const unsubscribe = openPostgresChannel({
      client: supabase,
      baseName: 'sofia-monitor',
      bindings: [
        {
          filter: { event: '*', schema: 'public', table: 'sofia_pending_drafts' },
          callback: () => { void refresh(); },
        },
        {
          filter: { event: '*', schema: 'public', table: 'sofia_settings', filter: 'id=eq.1' },
          callback: () => { void refresh(); },
        },
      ],
    });
    return () => {
      active = false;
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [load]);

  const openChat = (chat: string) => {
    dispatchWhatsAppFocusChat({ conversationId: chat });
    setAnchor(null);
  };

  const clearQueue = async () => {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc('sofia_vaciar_cola');
    setBusy(false);
    if (error) {
      setNotice('No se pudo vaciar la cola.');
      return;
    }
    await load();
  };

  const inOffice = teamIsInOffice(new Date());
  const mode = snapshot?.modo ?? 'apagada';
  const queue = snapshot?.cola ?? [];
  const bridges = snapshot?.puentes ?? [];

  return (
    <>
      <IconButton
        aria-label="Sofía ahora"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        size="small"
      >
        <Badge
          color="primary"
          badgeContent={mode === 'sola' ? (snapshot?.enPasada ?? 0) : queue.length}
          invisible={mode === 'sola' ? (snapshot?.enPasada ?? 0) === 0 : queue.length === 0}
        >
          <VisibilityOutlinedIcon fontSize="small" />
        </Badge>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 360, maxWidth: '80vw', p: 2 }} aria-label="Monitoreo de Sofía">
          <Typography variant="subtitle2">Sofía ahora</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {sofiaNowCopy(mode, inOffice)}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {sofiaPileCopy({
              noLeidos: snapshot?.noLeidos ?? 0,
              enPasada: snapshot?.enPasada ?? 0,
              ventanaCerrada: snapshot?.ventanaCerrada ?? 0,
              ultimoNuestro: snapshot?.ultimoNuestro ?? 0,
              silencioCorto: snapshot?.silencioCorto ?? 0,
              pausados: snapshot?.pausados ?? 0,
            })}
          </Typography>
          {failed ? (
            <Alert severity="warning" sx={{ mt: 1 }} role="status">No pude leer el monitoreo.</Alert>
          ) : null}
          {notice ? (
            <Alert severity="warning" sx={{ mt: 1 }} role="status">{notice}</Alert>
          ) : null}
          {mode === 'apagada' && queue.length > 0 ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
              <Typography variant="caption">Quedaron borradores con Sofía apagada.</Typography>
              <Button size="small" disabled={busy} onClick={() => void clearQueue()}>
                Dejar la cola en cero
              </Button>
            </Stack>
          ) : null}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
            Cola
          </Typography>
          {queue.length === 0 ? (
            <Typography variant="body2">Nadie en la cola.</Typography>
          ) : queue.map((item) => (
            <Button
              key={item.chat}
              onClick={() => openChat(item.chat)}
              sx={{ display: 'block', textAlign: 'left', textTransform: 'none', px: 0 }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">{item.nombre}</Typography>
                <Typography variant="caption" color="text.secondary">{ageLabel(item.haceMinutos)}</Typography>
                <Chip size="small" label={verdictLabel(item.veredicto)} />
              </Stack>
              {item.linea ? (
                <Typography variant="caption" color="text.secondary" display="block">{item.linea}</Typography>
              ) : null}
            </Button>
          ))}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
            Puentes de hoy
          </Typography>
          {bridges.length === 0 ? (
            <Typography variant="body2">Hoy no salió el mensaje puente.</Typography>
          ) : bridges.map((item) => (
            <Button
              key={`${item.chat}-${item.enviado}`}
              onClick={() => openChat(item.chat)}
              sx={{ display: 'block', textAlign: 'left', textTransform: 'none', px: 0 }}
            >
              <Typography variant="body2">
                {item.nombre} · {clockLabel(item.enviado)}
              </Typography>
            </Button>
          ))}
        </Box>
      </Popover>
    </>
  );
}
