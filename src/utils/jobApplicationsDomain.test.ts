import { describe, expect, it } from 'vitest';
import {
  canTransitionJobStage,
  fitMarkFromCleaning,
  fitRankFromMark,
  matchJobIdentity,
  resolveJobCohortFromTag,
  resolveJobCohortsFromTags,
  scoreCleaningExperience,
  shouldAutoCreateSubject,
} from './jobApplicationsDomain';

describe('jobApplicationsDomain', () => {
  it('maps Trabajo / CV aliases without a parallel category', () => {
    expect(resolveJobCohortFromTag('Job')).toBe('job');
    expect(resolveJobCohortFromTag('jobs')).toBe('job');
    expect(resolveJobCohortFromTag('trabajo / cv')).toBe('job');
    expect(resolveJobCohortFromTag('Marian')).toBe('marian_special');
    expect(resolveJobCohortsFromTags(['Job', 'Marian'])).toEqual(['job', 'marian_special']);
  });

  it('only auto-merges strong non-conflicting identities', () => {
    expect(matchJobIdentity(
      { fullName: 'Ana Pérez', documentNumber: '12345678' },
      { fullName: 'Otra', documentNumber: '12345678' },
    )).toEqual({ kind: 'strong', reason: 'document' });
    expect(matchJobIdentity(
      { fullName: 'Ana Pérez', phone: '3001112222' },
      { fullName: 'Ana Perez', phone: '573001112222' },
    )).toEqual({ kind: 'strong', reason: 'phone_and_name' });
    expect(matchJobIdentity(
      { fullName: 'Ana Pérez', phone: '3001112222' },
      { fullName: 'Luisa Díaz', phone: '3001112222' },
    )).toEqual({ kind: 'review', reason: 'phone_conflict' });
    expect(matchJobIdentity(
      { fullName: 'Ana Pérez' },
      { fullName: 'Ana Perez' },
    )).toEqual({ kind: 'review', reason: 'name_only' });
  });

  it('blocks hired without a real team member and requires a date or a note', () => {
    expect(canTransitionJobStage('inbound', 'hired', false)).toBe(false);
    expect(canTransitionJobStage('inbound', 'hired', true)).toBe(true);
    expect(canTransitionJobStage('inbound', 'interview_scheduled', true)).toBe(false);
    expect(canTransitionJobStage('inbound', 'interview_scheduled', true, {
      interviewAt: '2026-11-12T15:00:00.000Z',
    })).toBe(true);
    expect(canTransitionJobStage('inbound', 'rejected', true)).toBe(false);
    expect(canTransitionJobStage('inbound', 'rejected', true, { note: 'Sin experiencia' })).toBe(true);
  });

  it('marks a resume as priority only when cleaning experience is cited', () => {
    const one = scoreCleaningExperience([
      { key: 'experiencia', value: 'aseo', evidence: 'aseo en casas' },
    ]);
    expect(one.score).toBe(0.7);
    expect(fitRankFromMark(fitMarkFromCleaning(one.score, true, one.evidence.length))).toBe(2);

    const placed = scoreCleaningExperience([
      { key: 'experiencia', value: 'aseo de oficinas', evidence: 'aseo de oficinas en Cali' },
    ]);
    expect(placed.score).toBe(1);

    const empty = scoreCleaningExperience([
      { key: 'experiencia', value: 'ventas', evidence: 'vendía en un local' },
    ]);
    expect(empty.score).toBe(0);
    expect(fitMarkFromCleaning(empty.score, true, empty.evidence.length)).toBe('analyzed');
    expect(fitMarkFromCleaning(0, false, 0)).toBe('none');
  });

  it('auto-creates only clear multi-word identities', () => {
    expect(shouldAutoCreateSubject({
      fullName: 'Carla Restrepo',
      phone: '3009998888',
      confidence: 0.9,
      evidence: ['p1'],
    })).toBe(true);
    expect(shouldAutoCreateSubject({
      fullName: 'Carla',
      confidence: 0.9,
      evidence: ['p1'],
    })).toBe(false);
  });
});
