import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { directoryService } from '@/services/directoryService'
import { listWhatsAppTags, type WhatsAppConversation } from '@/services/whatsappService'
import { tagNamesToIds } from '@/utils/classificationLabels'
import {
  asIntakeIntentChoice,
  directoryTagsForIntent,
  isJobTag,
  jobTagRemoved,
  sameTagList,
  type IntakeIntentChoice,
} from '@/utils/intakeIntentControl'

export function patchIntakeLabel(
  queryClient: QueryClient,
  stableKey: string,
  label: string | null,
): void {
  queryClient.setQueriesData<WhatsAppConversation[]>(
    { queryKey: ['inbox', 'conversations'] },
    (current) => {
      if (!current) return current
      return current.map((item) =>
        item.id === stableKey
          ? { ...item, intakeIntentLabel: label ?? undefined }
          : item,
      )
    },
  )
}

export function invalidateDirectoryMeta(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['inbox', 'directory-meta'] })
}

export async function clearEmpleoIntent(stableKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('intake_intent_label')
    .eq('stable_key', stableKey)
    .maybeSingle()
  if (error) throw error
  if (data?.intake_intent_label !== 'empleo') return false
  const { error: updateError } = await supabase
    .from('whatsapp_conversations')
    .update({ intake_intent_label: null })
    .eq('stable_key', stableKey)
  if (updateError) throw updateError
  return true
}

export async function clearEmpleoIntentIfJobRemoved(input: {
  stableKey: string | null | undefined
  previousTags: readonly string[]
  nextTags: readonly string[]
}): Promise<boolean> {
  if (!input.stableKey || !jobTagRemoved(input.previousTags, input.nextTags)) return false
  return clearEmpleoIntent(input.stableKey)
}

async function syncDirectoryJobTag(input: {
  stableKey: string
  previous: IntakeIntentChoice
  next: IntakeIntentChoice
}): Promise<void> {
  const entry = await directoryService.findByConversation(input.stableKey)
  if (!entry) return
  const nextTags = directoryTagsForIntent({
    tags: entry.tags ?? [],
    previous: input.previous,
    next: input.next,
  })
  if (sameTagList(entry.tags ?? [], nextTags)) return
  const catalog = await listWhatsAppTags()
  if (input.next === 'empleo' && !catalog.some((tag) => isJobTag(tag.name))) {
    throw new Error('No existe el tag Job en el catálogo')
  }
  await directoryService.setClassificationTags(entry.id, tagNamesToIds(nextTags, catalog))
}

export async function saveIntakeIntent(input: {
  stableKey: string
  next: IntakeIntentChoice
  previous: string | null | undefined
}): Promise<void> {
  const previous = asIntakeIntentChoice(input.previous)
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ intake_intent_label: input.next })
    .eq('stable_key', input.stableKey)
  if (error) throw error
  await syncDirectoryJobTag({
    stableKey: input.stableKey,
    previous,
    next: input.next,
  })
}
