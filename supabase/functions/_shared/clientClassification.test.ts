import { assertEquals } from 'jsr:@std/assert';
import {
  hasBloqueadoTag,
  hasDeclineTag,
  hasPararTag,
  hasProblematicaTag,
  hasRiskTag,
  qualityLayer,
} from './clientClassification.ts';

Deno.test('qualityLayer gives risk priority when Problemática overlaps Favoritos', () => {
  assertEquals(
    qualityLayer({ tags: ['Favoritos', 'Cliente Problemática'] }, 9),
    'risk',
  );
});

Deno.test('Lilian / Marii Duque overlap: risk wins and favorite cannot coexist as layer', () => {
  assertEquals(
    qualityLayer({ tags: ['Favoritos', 'Cliente Problemática', 'Bloqueado'] }, 4),
    'risk',
  );
  assertEquals(
    qualityLayer({ tags: ['Favoritos', 'Decline'] }, 6),
    'risk',
  );
});

Deno.test('qualityLayer treats Bloqueado+Problemática as a single risk layer', () => {
  const client = { tags: ['Bloqueado', 'Cliente Problemática'] };
  assertEquals(hasProblematicaTag(client), true);
  assertEquals(hasBloqueadoTag(client), true);
  assertEquals(hasRiskTag(client), true);
  assertEquals(qualityLayer(client, 3), 'risk');
});

Deno.test('qualityLayer treats Decline+Bloqueado+Problemática as risk', () => {
  const client = {
    tags: ['Decline', 'Bloqueado', 'Cliente Problemática', 'Favoritos'],
  };
  assertEquals(hasDeclineTag(client), true);
  assertEquals(qualityLayer(client, 1), 'risk');
});

Deno.test('qualityLayer classifies Favoritos without risk as favorite', () => {
  assertEquals(qualityLayer({ tags: ['Favoritos'] }, 1), 'favorite');
});

Deno.test('qualityLayer uses 2+ COMPLETED as recurring', () => {
  assertEquals(qualityLayer({ tags: ['Agendado'] }, 2), 'recurring');
});

Deno.test('qualityLayer uses recurrente tag as recurring with one COMPLETED', () => {
  assertEquals(qualityLayer({ tags: ['Cliente recurrente'] }, 1), 'recurring');
});

Deno.test('qualityLayer falls back to standard on first COMPLETED', () => {
  assertEquals(qualityLayer({ tags: ['Agendado'] }, 1), 'standard');
});

Deno.test('hasProblematicaTag matches with or without accent', () => {
  assertEquals(hasProblematicaTag({ tags: ['Cliente Problematica'] }), true);
  assertEquals(hasProblematicaTag({ classification: 'Cliente Problemática' }), true);
});

Deno.test('Parar is not Decline or risk', () => {
  const client = { tags: ['Parar'] };
  assertEquals(hasPararTag(client), true);
  assertEquals(hasDeclineTag(client), false);
  assertEquals(hasRiskTag(client), false);
  assertEquals(qualityLayer(client, 1), 'standard');
});
