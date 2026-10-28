import { describe, expect, it } from 'vitest'
import {
  adIntentFromCopy,
  confirmIntakeModel,
  intakeIntentFromText,
  intakeProfileSentence,
  isGenericIntake,
  resolveMessageIntent,
} from '../../supabase/functions/_shared/intakeIntent'

describe('intakeIntentFromText', () => {
  it('Buscoenpleo es empleo', () => {
    expect(intakeIntentFromText('Buscoenpleo')).toBe('empleo')
    expect(intakeIntentFromText('busco empleo')).toBe('empleo')
    expect(intakeIntentFromText('tengo hoja de vida')).toBe('empleo')
  })

  it('quiero agendar una limpieza es hogar', () => {
    expect(intakeIntentFromText('Hola, quiero agendar una limpieza')).toBe('hogar')
    expect(intakeIntentFromText('Doméstica')).toBe('hogar')
  })

  it('oficina es empresas y las dos ramas no se entienden', () => {
    expect(intakeIntentFromText('limpieza de oficina')).toBe('no_se_entiende')
    expect(intakeIntentFromText('servicio empresarial')).toBe('empresas')
  })

  it('una queja no elige flujo', () => {
    expect(intakeIntentFromText('quiero agendar una limpieza, fue una queja')).toBe('no_se_entiende')
  })

  it('hola quiero más información es un saludo genérico', () => {
    expect(isGenericIntake('¡Hola! Quiero más información')).toBe(true)
    expect(resolveMessageIntent('¡Hola! Quiero más información', 'Vacantes para trabajo en casa')).toBe('empleo')
    expect(resolveMessageIntent('¡Hola! Quiero más información', '')).toBeNull()
    expect(isGenericIntake('quiero agendar una limpieza')).toBe(false)
  })

  it('un hola sigue al anuncio y una frase clara lo contradice', () => {
    expect(resolveMessageIntent('Hola', 'Vacantes para trabajo en casa')).toBe('empleo')
    expect(resolveMessageIntent('quiero información', 'Limpieza del hogar desde 88000')).toBe('hogar')
    expect(resolveMessageIntent('Buscoenpleo', 'Limpieza del hogar desde 88000')).toBe('empleo')
    expect(resolveMessageIntent('quiero agendar una limpieza', 'Buscamos personal de empleo')).toBe('hogar')
    expect(adIntentFromCopy('Limpieza y empleo')).toBeNull()
    expect(resolveMessageIntent('Hola', 'Limpieza y empleo')).toBeNull()
  })

  it('la ficha nombra el anuncio y la frase', () => {
    expect(intakeProfileSentence({
      route: 'hogar',
      phrase: 'quiero agendar una limpieza',
      adLabel: 'Glamping',
    })).toBe('Anuncio 312, Glamping. Pidió limpieza del hogar. Escribió: «quiero agendar una limpieza». Aún no da dirección ni fecha.')
  })

  it('Gemini solo confirma si cita el texto y no ve queja', () => {
    const text = 'necesito a alguien que me ayude en la casa'
    expect(confirmIntakeModel(text, {
      intent: 'hogar',
      evidence: 'alguien que me ayude en la casa',
      hasComplaint: false,
    })).toBe('hogar')
    expect(confirmIntakeModel(text, {
      intent: 'hogar',
      evidence: 'frase que no está',
      hasComplaint: false,
    })).toBeNull()
    expect(confirmIntakeModel(text, {
      intent: 'hogar',
      evidence: 'alguien que me ayude en la casa',
      hasComplaint: true,
    })).toBeNull()
    expect(confirmIntakeModel('Hola', {
      intent: 'empleo',
      evidence: 'Vacantes para trabajo',
      hasComplaint: false,
    }, 'Vacantes para trabajo en casa')).toBe('empleo')
  })
})
