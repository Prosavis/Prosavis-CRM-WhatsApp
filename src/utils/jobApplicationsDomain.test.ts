import { describe, expect, it } from 'vitest';
import {
  canTransitionJobStage,
  matchJobIdentity,
  resolveJobCohortFromTag,
  resolveJobCohortsFromTags,
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

  it('blocks hired without a real team member', () => {
    expect(canTransitionJobStage('interviewed', 'hired', false)).toBe(false);
    expect(canTransitionJobStage('interviewed', 'hired', true)).toBe(true);
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
