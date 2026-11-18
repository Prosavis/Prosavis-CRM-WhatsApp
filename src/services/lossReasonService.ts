import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import type { WhatsAppConversation } from '@/services/whatsappService'
import { LOSS_REASONS, type LossReason } from '../../supabase/functions/_shared/lossReasonGate'

export type { LossReason }

export const LOSS_REASON_CHOICES: Array<{ id: LossReason; label: string }> = [
  { id: 'precio', label: 'Precio' },
  { id: 'sin_cupo', label: 'Sin cupo' },
  { id: 'fuera_de_cobertura', label: 'Fuera de cobertura' },
  { id: 'dejo_de_responder', label: 'Dejó de responder' },
  { id: 'buscaba_empleo', label: 'Buscaba empleo' },
  { id: 'no_se_ofrece', label: 'No se ofrece' },
  { id: 'cerro_por_fuera', label: 'Cerró por fuera' },
  { id: 'solo_informandose', label: 'Solo se informaba' },
  { id: 'otro', label: 'Otro' },
]

export function asLossReason(value: string | null | undefined): LossReason | null {
  return LOSS_REASONS.includes(value as LossReason) ? value as LossReason : null
}

export function patchLossReason(
  queryClient: QueryClient,
  stableKey: string,
  reason: LossReason | null,
): void {
  queryClient.setQueriesData<WhatsAppConversation[]>(
    { queryKey: ['inbox', 'conversations'] },
    (current) => {
      if (!current) return current
      return current.map((item) =>
        item.id === stableKey
          ? { ...item, lossReason: reason ?? undefined }
          : item,
      )
    },
  )
}

export async function saveLossReason(input: {
  stableKey: string
  next: LossReason | null
}): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({
      loss_reason: input.next,
      loss_reason_note: null,
      loss_reason_at: input.next ? new Date().toISOString() : null,
      loss_reason_by: data.user?.id ?? null,
      loss_reason_source: input.next ? 'persona' : null,
    })
    .eq('stable_key', input.stableKey)
  if (error) throw error
}
