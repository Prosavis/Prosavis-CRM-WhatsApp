import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { supabase } from '@/config/supabase';
import { openPostgresChannel } from '@/utils/inboxRealtimeSync';
import { customerPhoneFromStableKey } from '@/utils/whatsappLines';

const DISCARD_REASONS = [
  { value: 'muy_largo', label: 'Muy largo' },
  { value: 'tono', label: 'Tono' },
  { value: 'dato_erroneo', label: 'Dato erróneo' },
  { value: 'no_era_el_momento', label: 'No era el momento' },
  { value: 'falto_contexto', label: 'Faltó contexto' },
] as const;

const VERDICT_LABEL = {
  aprobar: 'Aprobar',
  devolver: 'Devolver',
  riesgo: 'Riesgo',
} as const;

const DRAFT_POLL_MS = 20_000;
const SENT_BUT_OPEN = 'El mensaje salió, pero el borrador no se cerró.';

interface PendingDraft {
  suggestion: string;
  suggestion_log_id: string | null;
  created_at: string;
}

interface DraftReview {
  verdict: keyof typeof VERDICT_LABEL;
  feedback: string | null;
  created_at: string;
}

function cardValue(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return String(node).trim();
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) return '';
  const record = node as Record<string, unknown>;
  const direct = record.valor;
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct).trim();
  return '';
}

/** Lo que se puede decir. Las notas internas no se muestran junto al borrador. */
function cardLines(ficha: unknown): string[] {
  if (!ficha || typeof ficha !== 'object') return ['Sin ficha'];
  const card = ficha as Record<string, unknown>;
  const servicio = card.servicio && typeof card.servicio === 'object'
    ? card.servicio as Record<string, unknown>
    : {};
  const pago = card.pago && typeof card.pago === 'object' ? card.pago as Record<string, unknown> : {};
  const comercial = card.comercial && typeof card.comercial === 'object'
    ? card.comercial as Record<string, unknown>
    : {};
  const lines = [
    ['Duración', cardValue(servicio.duracion_habitual)],
    ['Frecuencia', cardValue(servicio.frecuencia)],
    ['Franjas', cardValue(servicio.franjas)],
    ['Instrucciones', cardValue(servicio.instrucciones_permanentes)],
    ['No tocar', cardValue(servicio.no_tocar)],
    ['Pago', cardValue(pago.medio_habitual)],
    ['Interés', cardValue(comercial.interes_actual)],
    ['Pendientes', cardValue(card.pendientes)],
  ].filter(([, value]) => value);
  return lines.length > 0 ? lines.map(([label, value]) => `${label}: ${value}`) : ['Sin ficha'];
}

function reviewForDraft(draft: PendingDraft, review: DraftReview | null): DraftReview | null {
  if (!review) return null;
  if (Number.isNaN(Date.parse(review.created_at)) || Number.isNaN(Date.parse(draft.created_at))) return null;
  if (Date.parse(review.created_at) + 1000 < Date.parse(draft.created_at)) return null;
  return review;
}

function asReview(row: { verdict?: string; feedback?: string | null; created_at?: string } | null): DraftReview | null {
  if (!row?.created_at) return null;
  if (row.verdict !== 'aprobar' && row.verdict !== 'devolver' && row.verdict !== 'riesgo') return null;
  return { verdict: row.verdict, feedback: row.feedback ?? null, created_at: row.created_at };
}

/**
 * Borrador de Sofía sobre la caja de texto. El veredicto se muestra y no bloquea
 * el envío. Cualquier cuenta del CRM lo edita, lo envía o lo descarta.
 */
export function SofiaDraftPanel({
  stableKey,
  onSend,
}: {
  stableKey: string;
  onSend: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PendingDraft | null>(null);
  const [text, setText] = useState('');
  const [review, setReview] = useState<DraftReview | null>(null);
  const [card, setCard] = useState<string[]>(['Sin ficha']);
  const [busy, setBusy] = useState(false);
  const [resolveNotice, setResolveNotice] = useState<string | null>(null);
  const closedAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let shownSuggestion = '';
    const phone = customerPhoneFromStableKey(stableKey);

    const load = async () => {
      const ticket = ++generation;
      const [draftResult, reviewResult, cardResult] = await Promise.all([
        supabase
          .from('sofia_pending_drafts')
          .select('suggestion, suggestion_log_id, created_at')
          .eq('stable_key', stableKey)
          .maybeSingle(),
        supabase
          .from('sofia_draft_reviews')
          .select('verdict, feedback, created_at')
          .eq('stable_key', stableKey)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('whatsapp_client_cards')
          .select('ficha')
          .eq('phone', phone)
          .maybeSingle(),
      ]);
      if (!active || ticket !== generation) return;
      const nextDraft = draftResult.data as PendingDraft | null;
      if (!nextDraft?.suggestion || nextDraft.created_at === closedAt.current) {
        setDraft(null);
        return;
      }
      setDraft(nextDraft);
      setText((current) => {
        if (current.trim() === '' || current === shownSuggestion) {
          shownSuggestion = nextDraft.suggestion;
          return nextDraft.suggestion;
        }
        return current;
      });
      setReview(reviewForDraft(nextDraft, asReview(reviewResult.data)));
      setCard(cardLines(cardResult.data?.ficha));
    };

    void load();
    const unsubscribe = openPostgresChannel({
      client: supabase,
      baseName: `sofia-draft:${stableKey}`,
      bindings: [
        {
          filter: {
            event: '*',
            schema: 'public',
            table: 'sofia_pending_drafts',
            filter: `stable_key=eq.${stableKey}`,
          },
          callback: () => { void load(); },
        },
        {
          filter: {
            event: '*',
            schema: 'public',
            table: 'sofia_draft_reviews',
            filter: `stable_key=eq.${stableKey}`,
          },
          callback: () => { void load(); },
        },
      ],
    });
    const timer = window.setInterval(() => { void load(); }, DRAFT_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [stableKey]);

  if (!draft) return null;

  const edited = text.trim() !== draft.suggestion.trim();
  const visibleReview = reviewForDraft(draft, review);

  const close = async (reason: string | null, sent: boolean) => {
    setBusy(true);
    setResolveNotice(null);
    if (sent) {
      try {
        await onSend(text.trim());
      } catch {
        setBusy(false);
        setResolveNotice('No se pudo enviar el mensaje.');
        return;
      }
    }
    const { error } = await supabase.rpc('sofia_resolve_draft', {
      p_stable_key: stableKey,
      p_sent: sent,
      p_text: text.trim(),
      p_reason: reason,
    });
    setBusy(false);
    if (error) {
      setResolveNotice(sent ? SENT_BUT_OPEN : 'No se pudo cerrar el borrador.');
      return;
    }
    closedAt.current = draft.created_at;
    setDraft(null);
  };

  return (
    <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">Borrador de Sofía</Typography>
        <Chip size="small" label={visibleReview ? VERDICT_LABEL[visibleReview.verdict] : 'Revisando'} />
      </Stack>
      {visibleReview?.feedback ? (
        <Typography variant="caption" display="block" color="text.secondary">{visibleReview.feedback}</Typography>
      ) : null}
      {resolveNotice ? (
        <Alert severity="warning" sx={{ mt: 0.5 }} role="status">{resolveNotice}</Alert>
      ) : null}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ my: 0.5 }}>
        <TextField
          value={text}
          onChange={(event) => setText(event.target.value)}
          multiline
          fullWidth
          size="small"
        />
        <Box sx={{ minWidth: { md: 220 }, maxWidth: { md: 280 } }}>
          <Typography variant="caption" color="text.secondary">Ficha</Typography>
          {card.map((line) => (
            <Typography key={line} variant="caption" display="block">{line}</Typography>
          ))}
        </Box>
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button size="small" variant="contained" disabled={busy || !text.trim()} onClick={() => close(null, true)}>
          {edited ? 'Editar y enviar' : 'Enviar'}
        </Button>
        {DISCARD_REASONS.map((reason) => (
          <Button key={reason.value} size="small" disabled={busy} onClick={() => close(reason.value, false)}>
            {reason.label}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}
