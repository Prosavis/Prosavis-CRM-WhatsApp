import { describe, expect, it } from 'vitest'
import {
  REVIEW_BURST_SILENCE_MS,
  REVIEW_INTENT_SEND_ENABLED,
  burstSilenceElapsed,
  classifyReviewBurst,
  finalizeReviewJudgment,
  joinReviewBurst,
  quotesExistInBlock,
  reviewGateFailures,
  reviewIntentMark,
} from '../../supabase/functions/_shared/reviewIntent'

const ELENA = joinReviewBurst([
  { body: 'Hola buenos días, excelente. Nos encantó el servicio', atMs: 0 },
  { body: 'E comunico nuevamente para agendar en unos días', atMs: 12_000 },
])

describe('reviewIntent', () => {
  it('une las dos burbujas de Elena en un solo bloque', () => {
    expect(ELENA).toContain('Nos encantó el servicio')
    expect(ELENA).toContain('agendar en unos días')
  })

  it('el par de Elena queda positivo_y_reagendar', () => {
    const judgment = classifyReviewBurst(ELENA)
    expect(judgment.label).toBe('positivo_y_reagendar')
    expect(judgment.rulesEligible).toBe(true)
    expect(judgment.hasComplaint).toBe(false)
    expect(quotesExistInBlock(ELENA, judgment.quotes)).toBe(true)
  })

  it('un gracias suelto no queda apto', () => {
    const judgment = classifyReviewBurst('Gracias')
    expect(judgment.label).toBe('solo_gracias')
    expect(judgment.rulesEligible).toBe(false)
    expect(reviewIntentMark({ eligible: false, label: judgment.label })).toBe('no_pedir')
  })

  it('excelente pero llegó tarde no queda apto', () => {
    const judgment = classifyReviewBurst('Excelente, pero llegó tarde')
    expect(judgment.label).toBe('mixto')
    expect(judgment.rulesEligible).toBe(false)
    expect(judgment.hasComplaint).toBe(true)
    expect(reviewIntentMark({ eligible: false, label: judgment.label })).toBe('queja')
  })

  it('el piso quedó igual no queda apto', () => {
    const judgment = classifyReviewBurst('Sí, excelente, el piso quedó igual')
    expect(judgment.rulesEligible).toBe(false)
    expect(judgment.hasComplaint).toBe(true)
  })

  it('mañana otra vez sin elogio no pide reseña', () => {
    const judgment = classifyReviewBurst('Mañana otra vez')
    expect(judgment.label).toBe('solo_reagendar')
    expect(judgment.rulesEligible).toBe(false)
  })

  it('una cita que no está en el texto tira la confirmación', () => {
    const finalized = finalizeReviewJudgment(ELENA, {
      label: 'positivo_y_reagendar',
      evidence: ['esto no lo escribió la clienta'],
      aboutCompletedService: true,
      hasComplaint: false,
    })
    expect(finalized.eligible).toBe(false)
    expect(finalized.vetoReasons).toContain('cita_no_esta_en_el_texto')
  })

  it('el modelo no vuelve apto un mixto', () => {
    const finalized = finalizeReviewJudgment('Excelente, pero llegó tarde', {
      label: 'positivo',
      evidence: ['Excelente, pero llegó tarde'],
      aboutCompletedService: true,
      hasComplaint: false,
    })
    expect(finalized.eligible).toBe(false)
    expect(finalized.label).toBe('mixto')
  })

  it('confirma a Elena solo si el modelo cita el texto y no ve queja', () => {
    const rules = classifyReviewBurst(ELENA)
    const finalized = finalizeReviewJudgment(ELENA, {
      label: 'positivo_y_reagendar',
      evidence: rules.quotes,
      aboutCompletedService: true,
      hasComplaint: false,
    })
    expect(finalized.eligible).toBe(true)
    expect(finalized.label).toBe('positivo_y_reagendar')
    expect(reviewIntentMark(finalized)).toBe('apto')
  })

  it('sin modelo no queda apto', () => {
    expect(finalizeReviewJudgment(ELENA, null).eligible).toBe(false)
  })

  it('los filtros duros frenan antes del texto', () => {
    expect(reviewGateFailures({
      hasClosing: true,
      optOut: true,
      blacklisted: false,
      problematica: false,
      openComplaint: false,
      cleanerChangeWentBadly: false,
      reviewAlreadyRequested: false,
      audioWithoutTranscript: false,
      imageWithoutText: false,
      intakeWasEmpleo: false,
      contextComplaint: false,
    })).toContain('opt_out')
    expect(reviewGateFailures({
      hasClosing: true,
      optOut: false,
      blacklisted: false,
      problematica: false,
      openComplaint: false,
      cleanerChangeWentBadly: false,
      reviewAlreadyRequested: false,
      audioWithoutTranscript: false,
      imageWithoutText: false,
      intakeWasEmpleo: true,
      contextComplaint: false,
    })).toContain('ingreso_empleo')
  })

  it('espera 45 segundos de silencio', () => {
    expect(burstSilenceElapsed(0, REVIEW_BURST_SILENCE_MS - 1)).toBe(false)
    expect(burstSilenceElapsed(0, REVIEW_BURST_SILENCE_MS)).toBe(true)
  })

  it('el envío permanece apagado', () => {
    expect(REVIEW_INTENT_SEND_ENABLED).toBe(false)
  })
})
