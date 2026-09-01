import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import {
  composeEmpresasWhatsApp,
  nextWhatsAppNeed,
  passLimit,
  remainingForQuota,
  resolveEmpresasSendWindow,
  sectorHookFromCiiu,
  shouldContinueWhatsAppQuota,
  waCompanyParam,
} from './empresasOutreach.ts';

Deno.test('sectorHook maps Consultando Tributos CIIU to accounting in Pereira', () => {
  const hook = sectorHookFromCiiu(
    'M6920 ** Actividades de contabilidad  teneduria de libros  auditoria financiera y asesoria tributaria',
    'PEREIRA',
  );
  assertEquals(hook, 'contabilidad y asesoría tributaria en Pereira');
});

Deno.test('sectorHook maps commerce and industry families', () => {
  assertEquals(
    sectorHookFromCiiu('G4530 ** Comercio de partes', 'Dosquebradas'),
    'comercio y locales en Dosquebradas',
  );
  assertEquals(sectorHookFromCiiu('C2395 ** Fabricación', 'Pereira'), 'industria en Pereira');
});

Deno.test('sectorHook falls back without CIIU', () => {
  assertEquals(sectorHookFromCiiu(null, 'Pereira'), 'su operación en Pereira');
  assertEquals(sectorHookFromCiiu(null, null), 'su operación en el Eje Cafetero');
});

Deno.test('composeEmpresasWhatsApp interpolates without household prices', () => {
  const out = composeEmpresasWhatsApp({
    name: "''CONSULTANDO TRIBUTOS S.A.S.''",
    municipio: 'PEREIRA',
    ciiu: 'M6920 ** Actividades de contabilidad  teneduria de libros',
  });
  assertEquals(out.company, 'Consultando Tributos S.A.S.');
  assertEquals(out.sector, 'contabilidad y asesoría tributaria en Pereira');
  assertStringIncludes(out.body, 'equipo de Consultando Tributos S.A.S.');
  assertStringIncludes(out.body, 'contabilidad y asesoría tributaria en Pereira');
  assertEquals(out.body.includes('$'), false);
  assertEquals(out.body.includes('88.000'), false);
  assertEquals(waCompanyParam(''), 'su empresa');
});

Deno.test('nextWhatsAppNeed pide los que faltan para 50 enviados', () => {
  assertEquals(nextWhatsAppNeed(50, 40), 10);
  assertEquals(nextWhatsAppNeed(50, 50), 0);
  assertEquals(nextWhatsAppNeed(50, 0), 50);
  assertEquals(nextWhatsAppNeed(50, 63), 0);
});

Deno.test('shouldContinueWhatsAppQuota corta al tope de intentos o al target', () => {
  assertEquals(
    shouldContinueWhatsAppQuota({ target: 50, sent: 40, attempts: 50, maxAttempts: 100 }),
    true,
  );
  assertEquals(
    shouldContinueWhatsAppQuota({ target: 50, sent: 50, attempts: 50, maxAttempts: 100 }),
    false,
  );
  assertEquals(
    shouldContinueWhatsAppQuota({ target: 50, sent: 40, attempts: 100, maxAttempts: 100 }),
    false,
  );
});

Deno.test('remainingForQuota and passLimit keep a 504 retry from sending another 50', () => {
  assertEquals(remainingForQuota(50, 44), 6);
  assertEquals(remainingForQuota(50, 50), 0);
  assertEquals(remainingForQuota(50, 95), 0);
  assertEquals(passLimit(6, 50, 20), 6);
  assertEquals(passLimit(50, 50, 20), 20);
  assertEquals(passLimit(50, 6, 20), 6);
});

Deno.test('resolveEmpresasSendWindow uses Bogotá 08:00 / 12:30 / 18:00', () => {
  const morning = resolveEmpresasSendWindow(new Date('2026-09-01T13:10:00.000Z'));
  assertEquals(morning.label, '08:00');
  const noon = resolveEmpresasSendWindow(new Date('2026-09-01T17:31:00.000Z'));
  assertEquals(noon.label, '12:30');
  const evening = resolveEmpresasSendWindow(new Date('2026-09-01T23:05:00.000Z'));
  assertEquals(evening.label, '18:00');
  const beforeOpen = resolveEmpresasSendWindow(new Date('2026-09-02T12:00:00.000Z'));
  assertEquals(beforeOpen.label, '18:00');
});
