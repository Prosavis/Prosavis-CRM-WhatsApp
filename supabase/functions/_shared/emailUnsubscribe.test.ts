import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { buildRfc822, composeEmpresasEmail } from './empresasOutreach.ts';
import {
  applyEmailUnsubscribe,
  listUnsubscribeHeaderValue,
  resolveListUnsubscribe,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from './emailUnsubscribe.ts';

Deno.test('unsubscribe token round-trips the email', async () => {
  const token = await signUnsubscribeToken('Ada.Lovelace@Empresa.com', 'secret-test');
  assertEquals(await verifyUnsubscribeToken(token, 'secret-test'), 'ada.lovelace@empresa.com');
});

Deno.test('unsubscribe token rejects a wrong secret or a tweak', async () => {
  const token = await signUnsubscribeToken('lead@empresa.com', 'secret-test');
  assertEquals(await verifyUnsubscribeToken(token, 'otro'), null);
  assertEquals(await verifyUnsubscribeToken(`${token}x`, 'secret-test'), null);
  assertEquals(await verifyUnsubscribeToken('v1.not-base64.nope', 'secret-test'), null);
});

Deno.test('resolveListUnsubscribe keeps mailto when the secret is missing', async () => {
  const unsub = await resolveListUnsubscribe({ email: 'lead@empresa.com' });
  assertEquals(unsub.https, undefined);
  assertStringIncludes(unsub.mailto, 'mailto:comercial@prosavis.com?subject=BAJA');
});

Deno.test('resolveListUnsubscribe adds one-click HTTPS when a secret exists', async () => {
  const unsub = await resolveListUnsubscribe({
    email: 'lead@empresa.com',
    secret: 'secret-test',
    baseUrl: 'https://example.test/functions/v1/email-unsubscribe',
  });
  assertStringIncludes(unsub.https ?? '', 'https://example.test/functions/v1/email-unsubscribe?t=v1.');
  assertStringIncludes(listUnsubscribeHeaderValue(unsub), '<mailto:comercial@prosavis.com?subject=BAJA>');
  assertStringIncludes(listUnsubscribeHeaderValue(unsub), '<https://example.test/functions/v1/email-unsubscribe?t=');
});

Deno.test('buildRfc822 adds List-Unsubscribe and one-click when HTTPS is present', () => {
  const raw = buildRfc822({
    from: 'comercial@prosavis.com',
    to: 'lead@empresa.com',
    subject: 'Cotización',
    body: 'Hola',
    htmlBody: '<p>Hola</p>',
    listUnsubscribe: {
      mailto: 'mailto:comercial@prosavis.com?subject=BAJA',
      https: 'https://example.test/unsub?t=v1.abc',
    },
  });
  assertStringIncludes(raw, 'List-Unsubscribe: <mailto:comercial@prosavis.com?subject=BAJA>, <https://example.test/unsub?t=v1.abc>');
  assertStringIncludes(raw, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
});

Deno.test('buildRfc822 omits one-click Post when only mailto exists', () => {
  const raw = buildRfc822({
    from: 'comercial@prosavis.com',
    to: 'lead@empresa.com',
    subject: 'Cotización',
    body: 'Hola',
    htmlBody: '<p>Hola</p>',
    listUnsubscribe: { mailto: 'mailto:comercial@prosavis.com?subject=BAJA' },
  });
  assertStringIncludes(raw, 'List-Unsubscribe: <mailto:comercial@prosavis.com?subject=BAJA>');
  assertEquals(raw.includes('List-Unsubscribe-Post'), false);
});

Deno.test('applyEmailUnsubscribe only touches that email via the store', async () => {
  const seen: string[] = [];
  const result = await applyEmailUnsubscribe(
    {
      async markDirectoryOptOut(email) {
        seen.push(`dir:${email}`);
        return 1;
      },
      async excludePendingOutreach(email) {
        seen.push(`out:${email}`);
        return 1;
      },
    },
    'Lead@Empresa.com',
  );
  assertEquals(result, { directory: 1, outreach: 1 });
  assertEquals(seen, ['dir:lead@empresa.com', 'out:lead@empresa.com']);
});

Deno.test('composeEmpresasEmail signs as Francy 311 and keeps 312 only in the CTA', () => {
  const out = composeEmpresasEmail(
    {
      name: 'Consultando Tributos S.A.S.',
      address: null,
      municipio: 'PEREIRA',
      ciiu: 'M6920 ** Actividades de contabilidad',
    },
    'lead@empresa.com',
    { unsubscribeUrl: 'https://example.test/unsub?t=v1.abc' },
  );
  assertStringIncludes(out.htmlBody, 'Francy Olivera');
  assertStringIncludes(out.htmlBody, 'https://wa.me/573112121108');
  assertStringIncludes(out.htmlBody, '311 212 1108');
  assertEquals(out.htmlBody.includes('301 203 0253'), false);
  assertEquals(out.htmlBody.includes('wa.me/573012030253'), false);
  assertStringIncludes(out.htmlBody, 'https://example.test/unsub?t=v1.abc');
  assertStringIncludes(out.htmlBody, '312 253 1271');
  assertStringIncludes(out.body, 'Francy Olivera');
  assertStringIncludes(out.body, '+57 311 212 1108');
  assertEquals(out.body.includes('301 203 0253'), false);
  assertEquals(out.htmlBody.includes('Nicolás'), false);
  const footer = out.htmlBody.slice(out.htmlBody.lastIndexOf('Francy Olivera'));
  assertEquals(footer.includes('312 253 1271'), false);
});
