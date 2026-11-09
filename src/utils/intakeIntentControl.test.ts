import { describe, expect, it } from 'vitest'
import {
  directoryTagsForIntent,
  jobTagRemoved,
  sameTagList,
} from './intakeIntentControl'

describe('directoryTagsForIntent', () => {
  it('empleo agrega Job y conserva los demás tags', () => {
    expect(directoryTagsForIntent({
      tags: ['Cliente Potencial', 'anuncio-meta'],
      previous: 'hogar',
      next: 'empleo',
    })).toEqual(['Cliente Potencial', 'anuncio-meta', 'Job'])
  })

  it('hogar, empresas o quitar sacan Job solo si la intención era empleo', () => {
    expect(directoryTagsForIntent({
      tags: ['Cliente Potencial', 'Job', 'anuncio-meta'],
      previous: 'empleo',
      next: 'hogar',
    })).toEqual(['Cliente Potencial', 'anuncio-meta'])
    expect(directoryTagsForIntent({
      tags: ['Cliente Potencial', 'Job'],
      previous: 'empleo',
      next: null,
    })).toEqual(['Cliente Potencial'])
    expect(directoryTagsForIntent({
      tags: ['Cliente Potencial', 'Job'],
      previous: 'hogar',
      next: 'empresas',
    })).toEqual(['Cliente Potencial', 'Job'])
  })

  it('detecta que Job salió de la ficha', () => {
    expect(jobTagRemoved(['Cliente Potencial', 'Job'], ['Cliente Potencial'])).toBe(true)
    expect(jobTagRemoved(['Cliente Potencial'], ['Cliente Potencial'])).toBe(false)
    expect(sameTagList(['Job', 'Cliente Potencial'], ['job', 'Cliente Potencial'])).toBe(true)
  })
})
