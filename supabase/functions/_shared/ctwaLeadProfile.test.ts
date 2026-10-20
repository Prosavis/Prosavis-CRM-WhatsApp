import { assertEquals } from 'jsr:@std/assert';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CTWA_ROUTE_TAG,
  adminNoteLine,
  appendAdminNote,
  appendRouteContextSheet,
  choiceForRoute,
  ctwaLeadWebhookEnv,
  stampCtwaLead,
  writesContextSheet,
} from './ctwaLeadProfile.ts';

const NOW = new Date('2026-10-19T19:36:00.000Z');

Deno.test('route tags stay the catalog names', () => {
  assertEquals(CTWA_ROUTE_TAG.hogar, 'Cliente Potencial');
  assertEquals(CTWA_ROUTE_TAG.empresas, 'Empresas');
  assertEquals(CTWA_ROUTE_TAG.empleo, 'Job');
  assertEquals(choiceForRoute('hogar'), 'domestica');
  assertEquals(writesContextSheet('empleo'), false);
  assertEquals(writesContextSheet('hogar'), true);
});

Deno.test('the first sheet keeps an existing diary', () => {
  const existing = [
    '[Vigente 2026-08-01 09:00 Bogotá] VIP.',
    '---',
    '## Diario',
    '### 2026-08-01 09:00 · campo',
    'Alta ficha.',
    '',
  ].join('\n');
  const sheet = appendRouteContextSheet({ existing, action: 'hogar', now: NOW });
  assertEquals(sheet.startsWith('[Vigente 2026-10-19 14:36 Bogotá] Anuncio 312, doméstica.'), true);
  assertEquals(sheet.includes('Alta ficha.'), true);
  assertEquals(sheet.includes('### 2026-10-19 14:36 · bot 312'), true);
  assertEquals(
    sheet.indexOf('### 2026-08-01 09:00 · campo') < sheet.indexOf('### 2026-10-19 14:36 · bot 312'),
    true,
  );
});

Deno.test('admin note appends the branch, the ad and the hour once', () => {
  const line = adminNoteLine({ action: 'empresas', adId: '1202', now: NOW });
  assertEquals(line, 'empresarial · anuncio 1202 · 2026-10-19 14:36');
  assertEquals(appendAdminNote('Llamar', line), `Llamar\n${line}`);
  assertEquals(appendAdminNote(`Llamar\n${line}`, line), `Llamar\n${line}`);
});

Deno.test('missing webhook url does not count as configured', () => {
  assertEquals(ctwaLeadWebhookEnv({}), { url: undefined, secret: undefined });
  assertEquals(ctwaLeadWebhookEnv({ GROK_CTWA_LEAD_WEBHOOK_URL: 'UNSET' }).url, undefined);
});

type Step = { op: string; name: string; payload?: unknown };

function fakeClient(options: {
  directory: Array<{ id: string; full_name: string | null; internal_notes: string | null; whatsapp_conversation_id: string | null }>;
  directoryId: string;
}) {
  const steps: Step[] = [];
  const client = {
    steps,
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        or() { return builder; },
        limit() {
          steps.push({ op: 'list', name: table });
          return Promise.resolve({ data: options.directory, error: null });
        },
        maybeSingle() {
          steps.push({ op: 'one', name: table });
          if (table === 'whatsapp_chat_tags') {
            return Promise.resolve({ data: { id: 'tag-1' }, error: null });
          }
          return Promise.resolve({
            data: {
              contact_name: 'Ana Pérez',
              whatsapp_profile_name: null,
              ctwa_source_id: '1202',
              admin_notes: '',
              tag_ids: [],
            },
            error: null,
          });
        },
        update(payload: unknown) {
          steps.push({ op: 'update', name: table, payload });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
      return builder;
    },
    rpc(fn: string, args: unknown) {
      steps.push({ op: 'rpc', name: fn, payload: args });
      return Promise.resolve({ data: options.directoryId, error: null });
    },
  };
  return client;
}

Deno.test('a new domestic lead is filed before the tag, without waiting on Grok', async () => {
  const client = fakeClient({ directory: [], directoryId: 'dir-1' });
  const fetched: string[] = [];
  await stampCtwaLead({
    supabase: client as unknown as SupabaseClient,
    stableKey: '573001112233',
    to: '573001112233',
    action: 'hogar',
    now: NOW,
    env: { GROK_CTWA_LEAD_WEBHOOK_URL: 'https://grok.example/lead' },
    fetchImpl: (url) => {
      fetched.push(String(url));
      return Promise.resolve(new Response('{}', { status: 200 }));
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rpcAt = client.steps.findIndex((step) => step.op === 'rpc');
  const tagAt = client.steps.findIndex((step) =>
    step.op === 'update' && step.name === 'whatsapp_conversations'
    && JSON.stringify(step.payload).includes('tag_ids')
  );
  assertEquals(rpcAt >= 0 && tagAt > rpcAt, true);
  const upsert = client.steps.find((step) => step.name === 'upsert_directory_entry');
  const entry = (upsert?.payload as { p_entry: { full_name?: string } }).p_entry;
  assertEquals(entry.full_name, 'Ana Pérez');
  const sheet = client.steps.find((step) =>
    step.op === 'update' && step.name === 'crm_directory'
  );
  assertEquals(JSON.stringify(sheet?.payload).includes('Anuncio 312, doméstica'), true);
  assertEquals(fetched, ['https://grok.example/lead']);
});

Deno.test('an existing ficha keeps its name and a job seeker gets no client sheet', async () => {
  const client = fakeClient({
    directory: [{
      id: 'dir-9',
      full_name: 'Nombre de la ficha',
      internal_notes: '[Vigente 2026-08-01 09:00 Bogotá] VIP.\n---\n## Diario\n### 2026-08-01 09:00 · campo\nAlta.\n',
      whatsapp_conversation_id: '573001112233',
    }],
    directoryId: 'dir-9',
  });
  await stampCtwaLead({
    supabase: client as unknown as SupabaseClient,
    stableKey: '573001112233',
    to: '573001112233',
    action: 'empleo',
    now: NOW,
    env: {},
  });
  const upsert = client.steps.find((step) => step.name === 'upsert_directory_entry');
  const entry = (upsert?.payload as { p_entry: { full_name?: string; id?: string } }).p_entry;
  assertEquals(entry.full_name, undefined);
  assertEquals(entry.id, 'dir-9');
  assertEquals(client.steps.some((step) => step.op === 'update' && step.name === 'crm_directory'), false);
  const tagUpdate = client.steps.find((step) =>
    step.op === 'update' && JSON.stringify(step.payload).includes('tag_ids')
  );
  assertEquals(JSON.stringify(tagUpdate?.payload).includes('tag-1'), true);
});
