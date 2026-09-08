import { assertEquals } from 'jsr:@std/assert';
import { applyOutreachIdentityToEntry } from './directoryOutreachIdentity.ts';

Deno.test('applyOutreachIdentityToEntry keeps company ficha id and drops WA push name', () => {
  const attached = applyOutreachIdentityToEntry(
    {
      phone: '+573001112233',
      full_name: 'Juan',
      display_name: 'Juan',
      source: 'WHATSAPP',
      channels: ['WHATSAPP'],
    },
    {
      id: 'lead-1',
      name: 'CENTRO DE ESTETICA AMARA SAS',
      email: 'amara@example.com',
      nit: '9013550983',
      crm_directory_id: '11111111-1111-4111-8111-111111111111',
    },
  );
  assertEquals(attached.id, '11111111-1111-4111-8111-111111111111');
  assertEquals(attached.email, 'amara@example.com');
  assertEquals(attached.full_name, undefined);
  assertEquals(attached.display_name, undefined);
  const meta = attached.metadata as { outreach?: { nit?: string; leadId?: string } };
  assertEquals(meta.outreach?.nit, '9013550983');
  assertEquals(meta.outreach?.leadId, 'lead-1');
});

Deno.test('applyOutreachIdentityToEntry fills email/NIT when pool has no directory id', () => {
  const attached = applyOutreachIdentityToEntry(
    {
      phone: '+573001112244',
      source: 'WHATSAPP',
      channels: ['WHATSAPP'],
    },
    {
      id: 'lead-2',
      name: 'EMPRESA DEMO SAS',
      email: 'demo@example.com',
      nit: '9000000001',
      crm_directory_id: null,
    },
  );
  assertEquals(attached.email, 'demo@example.com');
  assertEquals(attached.full_name, 'EMPRESA DEMO SAS');
  assertEquals(attached.id, undefined);
});
