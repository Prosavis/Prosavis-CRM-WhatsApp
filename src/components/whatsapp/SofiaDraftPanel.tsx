import { useEffect, useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { supabase } from '@/config/supabase';

const DISCARD_REASONS = [
  { value: 'muy_largo', label: 'Muy largo' },
  { value: 'tono', label: 'Tono' },
  { value: 'dato_erroneo', label: 'Dato erróneo' },
  { value: 'no_era_el_momento', label: 'No era el momento' },
  { value: 'falto_contexto', label: 'Faltó contexto' },
] as const;

interface PendingDraft {
  suggestion: string;
  suggestion_log_id: string | null;
  created_at: string;
}

/**
 * Borrador de Sofía sobre la caja de texto. Cualquier cuenta del CRM lo envía,
 * lo edita o lo descarta con un motivo. Solo se muestra en el 312.
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from('sofia_pending_drafts')
      .select('suggestion, suggestion_log_id, created_at')
      .eq('stable_key', stableKey)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setDraft(data as PendingDraft);
        setText(data.suggestion);
      });
    return () => {
      active = false;
    };
  }, [stableKey]);

  if (!draft) return null;

  const close = async (reason: string | null, sent: boolean) => {
    setBusy(true);
    if (sent) await onSend(text.trim());
    if (draft.suggestion_log_id) {
      const approveMs = Date.now() - new Date(draft.created_at).getTime();
      await supabase
        .from('whatsapp_ai_suggestion_log')
        .update({
          discard_reason: reason,
          approve_ms: approveMs,
          action_taken: sent ? 'send_text' : 'discard',
        })
        .eq('id', draft.suggestion_log_id);
    }
    await supabase.from('sofia_pending_drafts').delete().eq('stable_key', stableKey);
    setBusy(false);
    setDraft(null);
  };

  return (
    <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary">Borrador de Sofía</Typography>
      <TextField
        value={text}
        onChange={(event) => setText(event.target.value)}
        multiline
        fullWidth
        size="small"
        sx={{ my: 0.5 }}
      />
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button size="small" variant="contained" disabled={busy || !text.trim()} onClick={() => close(null, true)}>
          Enviar
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
