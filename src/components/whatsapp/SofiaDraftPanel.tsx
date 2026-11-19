import { useEffect, useState } from 'react';
import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { supabase } from '@/config/supabase';
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

interface PendingDraft {
  suggestion: string;
  suggestion_log_id: string | null;
  created_at: string;
}

interface DraftReview {
  verdict: keyof typeof VERDICT_LABEL;
  feedback: string | null;
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

  useEffect(() => {
    let active = true;
    const phone = customerPhoneFromStableKey(stableKey);
    Promise.all([
      supabase
        .from('sofia_pending_drafts')
        .select('suggestion, suggestion_log_id, created_at')
        .eq('stable_key', stableKey)
        .maybeSingle(),
      supabase
        .from('sofia_draft_reviews')
        .select('verdict, feedback')
        .eq('stable_key', stableKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('whatsapp_client_cards')
        .select('ficha')
        .eq('phone', phone)
        .maybeSingle(),
    ]).then(([draftResult, reviewResult, cardResult]) => {
      if (!active || !draftResult.data) return;
      setDraft(draftResult.data as PendingDraft);
      setText(draftResult.data.suggestion);
      const verdict = reviewResult.data?.verdict;
      if (verdict === 'aprobar' || verdict === 'devolver' || verdict === 'riesgo') {
        setReview({ verdict, feedback: reviewResult.data?.feedback ?? null });
      }
      setCard(cardLines(cardResult.data?.ficha));
    });
    return () => {
      active = false;
    };
  }, [stableKey]);

  if (!draft) return null;

  const edited = text.trim() !== draft.suggestion.trim();

  const close = async (reason: string | null, sent: boolean) => {
    setBusy(true);
    if (sent) await onSend(text.trim());
    const { error } = await supabase.rpc('sofia_resolve_draft', {
      p_stable_key: stableKey,
      p_sent: sent,
      p_text: text.trim(),
      p_reason: reason,
    });
    setBusy(false);
    if (error) return;
    setDraft(null);
  };

  return (
    <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">Borrador de Sofía</Typography>
        {review ? <Chip size="small" label={VERDICT_LABEL[review.verdict]} /> : null}
      </Stack>
      {review?.feedback ? (
        <Typography variant="caption" display="block" color="text.secondary">{review.feedback}</Typography>
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
