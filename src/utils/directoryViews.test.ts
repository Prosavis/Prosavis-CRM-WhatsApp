import { describe, expect, it } from 'vitest';
import {
  applyDirectoryCrmView,
  directoryKpiTarget,
  resolveDirectoryCrmView,
  resolveDirectorySegment,
} from './directoryViews';

describe('directoryViews', () => {
  it('defaults to Agendados and keeps that view out of the URL', () => {
    expect(resolveDirectoryCrmView(new URLSearchParams('tab=leads'))).toBe('scheduled');
    const next = applyDirectoryCrmView(new URLSearchParams('tab=leads&dirView=directorio'), 'scheduled');
    expect(next.get('tab')).toBe('leads');
    expect(next.get('dirView')).toBeNull();
    expect(next.get('vista')).toBeNull();
  });

  it('stores Directorio and Cancelados without colliding with metrics vista', () => {
    expect(resolveDirectoryCrmView(new URLSearchParams('dirView=directorio'))).toBe('all');
    expect(resolveDirectoryCrmView(new URLSearchParams('dirView=cancelados'))).toBe('canceled');
    const next = applyDirectoryCrmView(new URLSearchParams('tab=metrics&vista=clientes'), 'all');
    expect(next.get('tab')).toBe('leads');
    expect(next.get('dirView')).toBe('directorio');
    expect(next.get('vista')).toBeNull();
  });

  it('maps KPI cards to the approved view and segment', () => {
    expect(directoryKpiTarget('total')).toEqual({ view: 'all', segment: null });
    expect(directoryKpiTarget('scheduled')).toEqual({ view: 'scheduled', segment: null });
    expect(directoryKpiTarget('canceledOrRejected')).toEqual({ view: 'canceled', segment: null });
    expect(directoryKpiTarget('recurring')).toEqual({ view: 'all', segment: 'recurring' });
    expect(directoryKpiTarget('reactivation')).toEqual({ view: 'all', segment: 'reactivation' });
    expect(resolveDirectorySegment(new URLSearchParams('segment=recurring'))).toBe('recurring');
  });
});
