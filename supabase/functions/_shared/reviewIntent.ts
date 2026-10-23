/**
 * Juicio de intención antes de pedir una reseña.
 * No envía mensajes. REVIEW_INTENT_SEND_ENABLED permanece false.
 */

export const REVIEW_INTENT_SEND_ENABLED = false
export const REVIEW_BURST_SILENCE_MS = 45_000

export const REVIEW_INTENT_LABELS = [
  'positivo',
  'positivo_y_reagendar',
  'solo_gracias',
  'solo_reagendar',
  'queja',
  'mixto',
  'no_se_entiende',
] as const

export type ReviewIntentLabel = (typeof REVIEW_INTENT_LABELS)[number]

export type ReviewIntentMark = 'apto' | 'queja' | 'no_pedir'

export interface ReviewBurstMessage {
  body: string
  atMs: number
}

export interface ReviewGateInput {
  hasClosing: boolean
  optOut: boolean
  blacklisted: boolean
  problematica: boolean
  openComplaint: boolean
  cleanerChangeWentBadly: boolean
  reviewAlreadyRequested: boolean
  audioWithoutTranscript: boolean
  imageWithoutText: boolean
  intakeWasEmpleo: boolean
  contextComplaint: boolean
}

export interface ReviewRulesJudgment {
  label: ReviewIntentLabel
  rulesEligible: boolean
  quotes: string[]
  vetoReasons: string[]
  hasComplaint: boolean
}

export interface ReviewModelJudgment {
  label: string
  evidence: string[]
  aboutCompletedService: boolean
  hasComplaint: boolean
}

export interface ReviewFinalJudgment extends ReviewRulesJudgment {
  eligible: boolean
}

const COMPLAINT_TOKENS = new Set([
  'pero',
  'aunque',
  'tarde',
  'sucio',
  'sucia',
  'mal',
  'malo',
  'mala',
  'pesimo',
  'pesima',
  'queja',
  'quejas',
  'devolucion',
])

const COMPLAINT_PHRASES = [
  'no vuelvo',
  'no volvi',
  'cobraron de mas',
  'cobro de mas',
  'quedo igual',
  'piso quedo',
]

const PRAISE_PHRASES = [
  'excelente',
  'encant',
  'super',
  'perfecto',
  'buenisim',
  'muy bien',
  'recomiend',
  'quedo bien',
  'nos gusto',
  'bacan',
  'chever',
]

const REBOOK_PHRASES = [
  'agendar',
  'reagendar',
  'nuevamente',
  'otra vez',
  'de nuevo',
  'unos dias',
  'proxima',
]

const THANKS_TOKENS = new Set(['gracias', 'ok', 'listo', 'vale', 'dale', 'mil'])
const GREETING_TOKENS = new Set([
  'hola',
  'buenos',
  'buen',
  'dias',
  'tardes',
  'noches',
  'hey',
  'senora',
  'senor',
  'sra',
  'sr',
])

export function normalizeReviewText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(text: string): string[] {
  const normalized = normalizeReviewText(text)
  return normalized ? normalized.split(' ') : []
}

function hasToken(tokens: string[], word: string): boolean {
  return tokens.includes(word)
}

function hasPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `) || normalized.includes(phrase)
}

export function burstSilenceElapsed(lastInboundAtMs: number, nowMs: number): boolean {
  return nowMs - lastInboundAtMs >= REVIEW_BURST_SILENCE_MS
}

export function joinReviewBurst(messages: ReviewBurstMessage[]): string {
  return messages
    .slice()
    .sort((a, b) => a.atMs - b.atMs)
    .map((message) => message.body.trim())
    .filter(Boolean)
    .join('\n')
}

export function reviewGateFailures(input: ReviewGateInput): string[] {
  const reasons: string[] = []
  if (!input.hasClosing) reasons.push('sin_cierre')
  if (input.optOut) reasons.push('opt_out')
  if (input.blacklisted) reasons.push('lista_negra')
  if (input.problematica) reasons.push('problematica')
  if (input.openComplaint) reasons.push('queja_abierta')
  if (input.cleanerChangeWentBadly) reasons.push('cambio_auxiliar')
  if (input.reviewAlreadyRequested) reasons.push('reseña_ya_pedida')
  if (input.audioWithoutTranscript) reasons.push('audio_sin_transcripcion')
  if (input.imageWithoutText) reasons.push('foto_sin_frase')
  if (input.intakeWasEmpleo) reasons.push('ingreso_empleo')
  if (input.contextComplaint) reasons.push('contexto_queja')
  return reasons
}

function complaintHit(normalized: string, tokens: string[]): string | null {
  if (hasToken(tokens, 'no')) return 'no'
  for (const token of tokens) {
    if (COMPLAINT_TOKENS.has(token)) return token
  }
  for (const phrase of COMPLAINT_PHRASES) {
    if (hasPhrase(normalized, phrase)) return phrase
  }
  return null
}

function hasPraise(normalized: string): boolean {
  return PRAISE_PHRASES.some((phrase) => normalized.includes(phrase))
}

function hasRebook(normalized: string): boolean {
  if (REBOOK_PHRASES.some((phrase) => normalized.includes(phrase))) return true
  return tokensOf(normalized).includes('manana')
}

function isThanksOnly(tokens: string[]): boolean {
  const meaningful = tokens.filter((token) => !GREETING_TOKENS.has(token))
  if (meaningful.length === 0) return true
  return meaningful.every((token) => THANKS_TOKENS.has(token))
}

function evidenceFrom(original: string, normalizedNeed: (part: string) => boolean): string[] {
  const parts = original
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const hits = parts.filter((part) => original.includes(part) && normalizedNeed(normalizeReviewText(part)))
  if (hits.length > 0) return hits
  const whole = original.trim()
  return whole && original.includes(whole) ? [whole] : []
}

export function classifyReviewBurst(text: string): ReviewRulesJudgment {
  const normalized = normalizeReviewText(text)
  const tokens = tokensOf(text)
  const complaint = complaintHit(normalized, tokens)
  const praise = hasPraise(normalized)
  const rebook = hasRebook(normalized)
  const thanksOnly = isThanksOnly(tokens)

  if (complaint && praise) {
    return {
      label: 'mixto',
      rulesEligible: false,
      quotes: evidenceFrom(text, (part) => complaintHit(part, tokensOf(part)) != null || hasPraise(part)),
      vetoReasons: [complaint],
      hasComplaint: true,
    }
  }
  if (complaint) {
    return {
      label: 'queja',
      rulesEligible: false,
      quotes: evidenceFrom(text, (part) => complaintHit(part, tokensOf(part)) != null),
      vetoReasons: [complaint],
      hasComplaint: true,
    }
  }
  if (thanksOnly && !praise && !rebook) {
    return {
      label: 'solo_gracias',
      rulesEligible: false,
      quotes: evidenceFrom(text, () => true),
      vetoReasons: ['solo_gracias'],
      hasComplaint: false,
    }
  }
  if (rebook && !praise) {
    return {
      label: 'solo_reagendar',
      rulesEligible: false,
      quotes: evidenceFrom(text, (part) => hasRebook(part)),
      vetoReasons: ['sin_elogio'],
      hasComplaint: false,
    }
  }
  if (praise && rebook) {
    return {
      label: 'positivo_y_reagendar',
      rulesEligible: true,
      quotes: evidenceFrom(text, (part) => hasPraise(part) || hasRebook(part)),
      vetoReasons: [],
      hasComplaint: false,
    }
  }
  if (praise) {
    return {
      label: 'positivo',
      rulesEligible: true,
      quotes: evidenceFrom(text, (part) => hasPraise(part)),
      vetoReasons: [],
      hasComplaint: false,
    }
  }
  return {
    label: 'no_se_entiende',
    rulesEligible: false,
    quotes: [],
    vetoReasons: ['sin_elogio'],
    hasComplaint: false,
  }
}

export function quotesExistInBlock(block: string, quotes: string[]): boolean {
  if (quotes.length === 0) return false
  const haystack = block.replace(/\s+/g, ' ').trim()
  const folded = haystack.toLowerCase()
  return quotes.every((quote) => {
    const trimmed = quote.trim()
    if (trimmed.length < 4) return false
    return haystack.includes(trimmed) || folded.includes(trimmed.toLowerCase())
  })
}

function isReviewLabel(value: string): value is ReviewIntentLabel {
  return (REVIEW_INTENT_LABELS as readonly string[]).includes(value)
}

export function finalizeReviewJudgment(
  text: string,
  model: ReviewModelJudgment | null,
): ReviewFinalJudgment {
  const rules = classifyReviewBurst(text)
  if (!rules.rulesEligible) {
    return { ...rules, eligible: false }
  }
  if (!model) {
    return {
      ...rules,
      eligible: false,
      vetoReasons: [...rules.vetoReasons, 'sin_confirmacion'],
    }
  }
  if (model.hasComplaint || model.aboutCompletedService === false) {
    const label = isReviewLabel(model.label) && model.label !== 'positivo' && model.label !== 'positivo_y_reagendar'
      ? model.label
      : 'mixto'
    return {
      label,
      rulesEligible: false,
      quotes: rules.quotes,
      vetoReasons: ['modelo_no_confirma'],
      hasComplaint: model.hasComplaint,
      eligible: false,
    }
  }
  if (model.label !== 'positivo' && model.label !== 'positivo_y_reagendar') {
    return {
      label: isReviewLabel(model.label) ? model.label : 'no_se_entiende',
      rulesEligible: false,
      quotes: rules.quotes,
      vetoReasons: ['modelo_no_confirma'],
      hasComplaint: false,
      eligible: false,
    }
  }
  if (!quotesExistInBlock(text, model.evidence)) {
    return {
      ...rules,
      eligible: false,
      vetoReasons: ['cita_no_esta_en_el_texto'],
    }
  }
  return {
    label: model.label,
    rulesEligible: true,
    quotes: model.evidence,
    vetoReasons: [],
    hasComplaint: false,
    eligible: true,
  }
}

export function reviewIntentMark(judgment: {
  eligible: boolean
  label: ReviewIntentLabel
}): ReviewIntentMark {
  if (judgment.eligible) return 'apto'
  if (judgment.label === 'queja' || judgment.label === 'mixto') return 'queja'
  return 'no_pedir'
}

export function reviewIntentMarkText(mark: ReviewIntentMark): string {
  switch (mark) {
    case 'apto':
      return 'reseña: apto'
    case 'queja':
      return 'reseña: queja'
    case 'no_pedir':
      return 'reseña: no pedir'
    default: {
      const exhaustive: never = mark
      return exhaustive
    }
  }
}
