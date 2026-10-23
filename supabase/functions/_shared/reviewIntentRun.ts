import { directoryPhoneKey } from './directoryPhone.ts'
import { geminiGenerateJson, getGeminiApiKey } from './geminiClient.ts'
import { getServiceClient } from './supabase.ts'
import {
  REVIEW_BURST_SILENCE_MS,
  REVIEW_INTENT_SEND_ENABLED,
  burstSilenceElapsed,
  classifyReviewBurst,
  finalizeReviewJudgment,
  joinReviewBurst,
  reviewGateFailures,
  reviewIntentMark,
  type ReviewIntentLabel,
  type ReviewModelJudgment,
} from './reviewIntent.ts'

export type ReviewDb = ReturnType<typeof getServiceClient>

const REVIEW_TEMPLATES = new Set(['resena_google', 'resena_google_boton', 'resena_app'])

const MODEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'evidence', 'aboutCompletedService', 'hasComplaint'],
  properties: {
    label: {
      type: 'string',
      enum: [
        'positivo',
        'positivo_y_reagendar',
        'solo_gracias',
        'solo_reagendar',
        'queja',
        'mixto',
        'no_se_entiende',
      ],
    },
    evidence: { type: 'array', items: { type: 'string' } },
    aboutCompletedService: { type: 'boolean' },
    hasComplaint: { type: 'boolean' },
  },
} as const

interface LogRow {
  direction: string | null
  sender_type: string | null
  message_body: string | null
  template_name: string | null
  media_type: string | null
  voice_transcription: string | null
  created_at: string
  wa_message_id: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asRows(data: unknown): LogRow[] {
  if (!Array.isArray(data)) return []
  return data.filter((row): row is LogRow => !!row && typeof row === 'object')
}

function tagList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase())
  if (typeof value === 'string') return value.toLowerCase().split(/[,\s]+/).filter(Boolean)
  return []
}

function includesAny(values: string[], needles: string[]): boolean {
  return values.some((value) => needles.some((needle) => value.includes(needle)))
}

function parseModel(raw: unknown): ReviewModelJudgment | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.filter((item): item is string => typeof item === 'string')
    : []
  return {
    label: typeof record.label === 'string' ? record.label : 'no_se_entiende',
    evidence,
    aboutCompletedService: record.aboutCompletedService === true,
    hasComplaint: record.hasComplaint === true,
  }
}

async function confirmWithModel(text: string): Promise<ReviewModelJudgment | null> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null
  try {
    const raw = await geminiGenerateJson<unknown>({
      apiKey,
      maxOutputTokens: 800,
      thinkingLevel: 'low',
      responseJsonSchema: MODEL_SCHEMA as unknown as Record<string, unknown>,
      logScope: 'review-intent',
      systemInstruction:
        'Clasificas la respuesta de un cliente después de un servicio de limpieza ya terminado. No pidas reseña. evidence son citas textuales exactas del mensaje. hasComplaint es true si hay queja, tardanza, suciedad, cobro de más, sarcasmo o un pero. aboutCompletedService es true solo si habla del servicio ya hecho.',
      prompt: text,
    })
    return parseModel(raw)
  } catch (error) {
    console.error('[review-intent] modelo', error instanceof Error ? error.message : String(error))
    return null
  }
}

export async function runReviewIntentShadow(params: {
  supabase: ReviewDb
  stableKey: string
  phone: string
}): Promise<void> {
  if (REVIEW_INTENT_SEND_ENABLED) {
    throw new Error('El envío de reseña por intención está apagado.')
  }
  await sleep(REVIEW_BURST_SILENCE_MS)
  await judgeReviewIntentNow(params)
}

export async function judgeReviewIntentNow(params: {
  supabase: ReviewDb
  stableKey: string
  phone: string
}): Promise<void> {
  if (REVIEW_INTENT_SEND_ENABLED) {
    throw new Error('El envío de reseña por intención está apagado.')
  }

  const { data, error } = await params.supabase
    .from('whatsapp_message_log')
    .select('direction,sender_type,message_body,template_name,media_type,voice_transcription,created_at,wa_message_id')
    .eq('conversation_stable_key', params.stableKey)
    .order('created_at', { ascending: false })
    .limit(80)
  if (error) throw error

  const rows = asRows(data).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const closing = [...rows].reverse().find((row) =>
    row.direction === 'outbound' && row.template_name === 'service_finalizado'
  )
  if (!closing) return

  const closingAt = Date.parse(closing.created_at)
  const after = rows.filter((row) => Date.parse(row.created_at) > closingAt)
  const agentAt = after.find((row) => row.direction === 'outbound' && row.sender_type === 'agent')
  const agentMs = agentAt ? Date.parse(agentAt.created_at) : Number.POSITIVE_INFINITY
  const inbounds = after.filter((row) => {
    const at = Date.parse(row.created_at)
    return row.direction === 'inbound' && at < agentMs
  })
  if (inbounds.length === 0) return

  const lastInbound = inbounds[inbounds.length - 1]
  if (!burstSilenceElapsed(Date.parse(lastInbound.created_at), Date.now())) return

  const usable = inbounds.filter((row) => (row.message_body ?? '').trim().length > 0)
  const audioWithoutTranscript = usable.length === 0 && inbounds.some((row) =>
    row.media_type === 'audio' && !(row.voice_transcription ?? '').trim()
  )
  const imageWithoutText = usable.length === 0 && inbounds.some((row) => row.media_type === 'image')
  const reviewAlreadyRequested = rows.some((row) =>
    row.direction === 'outbound' && row.template_name != null && REVIEW_TEMPLATES.has(row.template_name)
  )

  const phoneKey = directoryPhoneKey(params.phone)
  const directoryResult = phoneKey
    ? await params.supabase
      .from('crm_directory')
      .select('opt_out,tags,classification,internal_notes')
      .eq('phone_key', phoneKey)
      .maybeSingle()
    : { data: null, error: null }
  const record = (directoryResult.data ?? {}) as {
    opt_out?: boolean
    tags?: unknown
    classification?: string | null
    internal_notes?: string | null
  }
  const tags = tagList(record.tags)
  const classification = (record.classification ?? '').toLowerCase()
  const notes = (record.internal_notes ?? '').toLowerCase()

  const gateReasons = reviewGateFailures({
    hasClosing: true,
    optOut: record.opt_out === true,
    blacklisted: includesAny(tags, ['bloqueado', 'decline', '🚫']),
    problematica: includesAny(tags, ['problematica']) || classification.includes('problematica'),
    openComplaint: includesAny(tags, ['queja']) || classification.includes('queja'),
    cleanerChangeWentBadly: notes.includes('cambio de auxiliar quedó mal') || notes.includes('cambio de auxiliar quedo mal') || includesAny(tags, ['cambio auxiliar']),
    reviewAlreadyRequested,
    audioWithoutTranscript,
    imageWithoutText,
    intakeWasEmpleo: false,
    contextComplaint: false,
  })
  const context = await loadReviewContext(params.supabase, params.stableKey, notes)
  if (context.intakeWasEmpleo) gateReasons.push('ingreso_empleo')
  if (context.complaint) gateReasons.push('contexto_queja')
  if (context.readFailed) gateReasons.push('contexto_no_leido')
  if (!phoneKey || directoryResult.error) gateReasons.push('directorio_no_leido')

  const burst = joinReviewBurst(usable.map((row) => ({
    body: row.message_body ?? '',
    atMs: Date.parse(row.created_at),
  })))

  let label: ReviewIntentLabel = gateReasons.includes('queja_abierta') || gateReasons.includes('problematica')
    ? 'queja'
    : 'no_se_entiende'
  let quotes: string[] = []
  let vetoReasons = gateReasons
  let hasComplaint = label === 'queja'
  let eligible = false

  if (gateReasons.length === 0 && burst.trim()) {
    const rules = classifyReviewBurst(burst)
    if (!rules.rulesEligible) {
      label = rules.label
      quotes = rules.quotes
      vetoReasons = rules.vetoReasons
      hasComplaint = rules.hasComplaint
    } else {
      const model = await confirmWithModel(burst)
      const finalJudgment = finalizeReviewJudgment(burst, model)
      label = finalJudgment.label
      quotes = finalJudgment.quotes
      vetoReasons = finalJudgment.vetoReasons
      hasComplaint = finalJudgment.hasComplaint
      eligible = finalJudgment.eligible
    }
  }

  const appointmentId = await appointmentIdForClosing(params.supabase, params.phone, closing.wa_message_id)
  const mark = reviewIntentMark({ eligible, label })
  const now = new Date().toISOString()

  const { error: saveError } = await params.supabase
    .from('whatsapp_review_intent_judgments')
    .upsert({
      appointment_id: appointmentId,
      conversation_stable_key: params.stableKey,
      recipient_phone: params.phone,
      burst_text: burst,
      label,
      quotes,
      veto_reasons: vetoReasons,
      eligible,
      has_complaint: hasComplaint,
      send_enabled: false,
      updated_at: now,
    }, { onConflict: 'appointment_id' })
  if (saveError) throw saveError

  const { error: markError } = await params.supabase
    .from('whatsapp_conversations')
    .update({
      review_intent_mark: mark,
      review_intent_label: label,
    })
    .eq('stable_key', params.stableKey)
  if (markError) throw markError
}

async function loadReviewContext(
  supabase: ReviewDb,
  stableKey: string,
  notes: string,
): Promise<{ intakeWasEmpleo: boolean; complaint: boolean; readFailed: boolean }> {
  const conversation = await supabase
    .from('whatsapp_conversations')
    .select('intake_intent_label, admin_notes')
    .eq('stable_key', stableKey)
    .maybeSingle()
  const memory = await supabase
    .from('whatsapp_conversation_ai_memory')
    .select('summary, objections')
    .eq('stable_key', stableKey)
    .maybeSingle()
  if (conversation.error || memory.error) {
    return { intakeWasEmpleo: false, complaint: false, readFailed: true }
  }
  const label = String((conversation.data as { intake_intent_label?: string } | null)?.intake_intent_label ?? '')
  const admin = String((conversation.data as { admin_notes?: string } | null)?.admin_notes ?? '').toLowerCase()
  const summary = String((memory.data as { summary?: string } | null)?.summary ?? '').toLowerCase()
  const objections = tagList((memory.data as { objections?: unknown } | null)?.objections).join(' ')
  const blob = `${notes}\n${admin}\n${summary}\n${objections}`
  return {
    intakeWasEmpleo: label === 'empleo' || summary.includes('intención: empleo') || summary.includes('intencion: empleo'),
    complaint: blob.includes('queja') || blob.includes('pésimo') || blob.includes('pesimo'),
    readFailed: false,
  }
}

async function appointmentIdForClosing(
  supabase: ReviewDb,
  phone: string,
  waMessageId: string | null,
): Promise<string> {
  const digits = phone.replace(/\D/g, '')
  if (waMessageId) {
    const { data } = await supabase
      .from('whatsapp_post_service_events')
      .select('appointment_id')
      .eq('wa_message_id', waMessageId)
      .maybeSingle()
    const appointmentId = (data as { appointment_id?: string } | null)?.appointment_id
    if (appointmentId) return appointmentId
  }
  if (digits) {
    const { data } = await supabase
      .from('whatsapp_post_service_events')
      .select('appointment_id,recipient_phone')
      .eq('template_name', 'service_finalizado')
      .eq('outcome', 'sent')
      .order('created_at', { ascending: false })
      .limit(30)
    const events = Array.isArray(data) ? data as Array<{
      appointment_id?: string
      recipient_phone?: string | null
    }> : []
    const match = events.find((event) => (event.recipient_phone ?? '').replace(/\D/g, '') === digits)
    if (match?.appointment_id) return match.appointment_id
  }
  return waMessageId ? `template:${waMessageId}` : `phone:${digits || 'sin-telefono'}`
}
