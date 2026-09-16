import { assertEquals } from 'jsr:@std/assert';
import {
  canTransitionJobStage,
  matchJobIdentity,
  resolveJobCohortFromTag,
  shouldAutoCreateSubject,
} from './domain.ts';
import { planSubjectActions } from '../documentAnalysis/applySubjects.ts';

Deno.test('trabajo aliases resolve to job or marian_special', () => {
  assertEquals(resolveJobCohortFromTag('Job'), 'job');
  assertEquals(resolveJobCohortFromTag('Marian'), 'marian_special');
});

Deno.test('dedupe stays conservative', () => {
  assertEquals(
    matchJobIdentity(
      { fullName: 'Ana Pérez', email: 'ana@test.com' },
      { fullName: 'Ana', email: 'ana@test.com' },
    ).kind,
    'strong',
  );
  assertEquals(
    matchJobIdentity({ fullName: 'Ana Pérez' }, { fullName: 'Ana Perez' }).kind,
    'review',
  );
});

Deno.test('hired requires a team member', () => {
  assertEquals(canTransitionJobStage('trial', 'hired', false), false);
});

Deno.test('split planner queues weak extra subjects for review', () => {
  const plan = planSubjectActions([
    {
      fullName: 'Carla Restrepo',
      phone: '3001112222',
      confidence: 0.9,
      evidence: ['p1'],
    },
    {
      fullName: 'Hija',
      confidence: 0.4,
      evidence: ['p2'],
    },
  ]);
  assertEquals(plan.splits.length, 1);
  assertEquals(plan.splits[0].autoCreate, false);
  assertEquals(plan.needsReview, true);
  assertEquals(shouldAutoCreateSubject(plan.keep!), true);
});
