import { assertEquals } from 'jsr:@std/assert';
import {
  getReactivationTagSkipReason,
  shouldSkipReactivationByTags,
} from './reactivationTagPolicy.ts';

Deno.test('Equipo Prosavis skips reactivation with tag_equipo', () => {
  assertEquals(getReactivationTagSkipReason({ tags: ['Equipo Prosavis'] }), 'tag_equipo');
  assertEquals(getReactivationTagSkipReason({ tags: ['  EQUIPO   PROSAVIS '] }), 'tag_equipo');
  assertEquals(
    getReactivationTagSkipReason({ classification: 'Agendado, Equipo Prosavis' }),
    'tag_equipo',
  );
  assertEquals(shouldSkipReactivationByTags({ tags: ['Equipo Prosavis'] }), true);
});

Deno.test('TEST still skips reactivation with tag_test', () => {
  assertEquals(getReactivationTagSkipReason({ tags: ['TEST'] }), 'tag_test');
});

Deno.test('the first matching tag decides the skip reason', () => {
  assertEquals(
    getReactivationTagSkipReason({ tags: ['Auxiliares', 'Equipo Prosavis'] }),
    'tag_team',
  );
});

Deno.test('a plain client is not skipped by tags', () => {
  assertEquals(getReactivationTagSkipReason({ tags: ['Agendado', 'Pereira'] }), null);
  assertEquals(shouldSkipReactivationByTags({ tags: ['Equipo'] }), false);
});
