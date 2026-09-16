import { assertEquals } from 'jsr:@std/assert';
import { buildProfileHealth, buildWeeklyFromDaily } from './appMetrics.ts';

Deno.test('profile health is presentational and sums weights', () => {
  const profile = buildProfileHealth({
    name: 'Prosavis Limpieza',
    mainImage: 'https://example.com/a.jpg',
    images: ['b.jpg'],
    description: 'x'.repeat(120),
    providerIsVerified: true,
    features: ['eco'],
    instagram: '@prosavis',
    rating: 4.8,
    views: 12,
  });
  assertEquals(profile.health.score, 100);
  assertEquals(profile.health.completedCriteria, 6);
  assertEquals(profile.health.criteria.every((item) => item.isMet), true);
});

Deno.test('missing profile fields stay at zero score', () => {
  const profile = buildProfileHealth({});
  assertEquals(profile.health.score, 0);
  assertEquals(profile.health.completedCriteria, 0);
});

Deno.test('weekly comparison uses Bogotá week keys', () => {
  const weekly = buildWeeklyFromDaily([
    { bucket: '2026-09-16', completed: 3, appointments: 4, revenue: 150000 },
    { bucket: '2026-09-09', completed: 1, appointments: 2, revenue: 50000 },
  ], '2026-09-16');
  assertEquals(weekly.servicesCompleted, 3);
  assertEquals(weekly.comparedToPrevWeek.servicesChange, 2);
  assertEquals(weekly.comparedToPrevWeek.revenueChange, 200);
});
