import { describe, expect, it, vi } from 'vitest';
import {
  OFFICIAL_ANSWERS_QUERY_LIMITS,
  loadConversationContext,
  loadDirectoryByPhone,
  loadOfficialAnswers,
} from '../../supabase/functions/_shared/inboxAiKnowledge';

type Row = Record<string, unknown>;
type QueryCall = { table: string; method: string; args: unknown[] };

function createSupabaseDouble(
  tableRows: Record<string, Row[]>,
  tableErrors: Record<string, Error> = {},
) {
  const calls: QueryCall[] = [];

  return {
    calls,
    client: {
      from(table: string) {
        let rows = [...(tableRows[table] ?? [])];
        let limit: number | null = null;
        const query = {
          select(...args: unknown[]) {
            calls.push({ table, method: 'select', args });
            return query;
          },
          eq(column: string, value: unknown) {
            calls.push({ table, method: 'eq', args: [column, value] });
            rows = rows.filter((row) => row[column] === value);
            return query;
          },
          in(column: string, values: unknown[]) {
            calls.push({ table, method: 'in', args: [column, values] });
            rows = rows.filter((row) => values.includes(row[column]));
            return query;
          },
          order(column: string, options: { ascending: boolean }) {
            calls.push({ table, method: 'order', args: [column, options] });
            rows.sort((left, right) => {
              const a = String(left[column] ?? '');
              const b = String(right[column] ?? '');
              return options.ascending ? a.localeCompare(b) : b.localeCompare(a);
            });
            return query;
          },
          limit(value: number) {
            calls.push({ table, method: 'limit', args: [value] });
            limit = value;
            return query;
          },
          maybeSingle() {
            calls.push({ table, method: 'maybeSingle', args: [] });
            const error = tableErrors[table] ?? null;
            return Promise.resolve({ data: error ? null : rows[0] ?? null, error });
          },
          then(
            resolve: (value: { data: Row[] | null; error: Error | null }) => unknown,
          ) {
            const error = tableErrors[table] ?? null;
            return Promise.resolve({
              data: error ? null : rows.slice(0, limit ?? rows.length),
              error,
            }).then(resolve);
          },
        };
        return query;
      },
    },
  };
}

describe('loadConversationContext', () => {
  it('maps operational fields and resolves only active tag names in conversation order', async () => {
    const { client, calls } = createSupabaseDouble({
      whatsapp_conversations: [{
        stable_key: '573001112233',
        tag_ids: ['tag-2', 'tag-1', 'archived'],
        admin_notes: '  Llamar después de las 4  ',
        assigned_to: 'agent-9',
        last_intent: 'booking',
        automated_inbound_disabled: true,
        contact_name: 'Marii Duque✨',
        whatsapp_profile_name: 'Marii Duque✨',
      }],
      whatsapp_chat_tags: [
        { id: 'tag-1', name: 'Favorito', archived: false },
        { id: 'tag-2', name: 'Bogotá', archived: false },
        { id: 'archived', name: 'No debe aparecer', archived: true },
      ],
    });

    const result = await loadConversationContext(client, '573001112233');

    expect(result).toEqual({
      tags: ['Bogotá', 'Favorito'],
      adminNotes: 'Llamar después de las 4',
      assignedTo: 'agent-9',
      lastIntent: 'booking',
      automatedInboundDisabled: true,
      contactName: 'Marii Duque✨',
      whatsappProfileName: 'Marii Duque✨',
    });
    expect(calls).toContainEqual({
      table: 'whatsapp_conversations',
      method: 'select',
      args: [
        'tag_ids, admin_notes, assigned_to, last_intent, automated_inbound_disabled, contact_name, whatsapp_profile_name',
      ],
    });
    expect(calls).toContainEqual({
      table: 'whatsapp_chat_tags',
      method: 'eq',
      args: ['archived', false],
    });
    expect(calls.some((call) =>
      call.table === 'whatsapp_chat_tags' && call.method === 'limit'
    )).toBe(false);
  });

  it('preserves every active tag when a conversation has more than 50 tag IDs', async () => {
    const tagIds = Array.from({ length: 125 }, (_, index) => `tag-${index}`);
    const { client, calls } = createSupabaseDouble({
      whatsapp_conversations: [{
        stable_key: '573001112233',
        tag_ids: tagIds,
      }],
      whatsapp_chat_tags: tagIds.map((id, index) => ({
        id,
        name: `Tag ${index}`,
        archived: false,
      })),
    });

    const result = await loadConversationContext(client, '573001112233');

    expect(result.tags).toHaveLength(125);
    expect(result.tags[0]).toBe('Tag 0');
    expect(result.tags[124]).toBe('Tag 124');
    expect(calls.some((call) =>
      call.table === 'whatsapp_chat_tags' && call.method === 'limit'
    )).toBe(false);
    const batches = calls.filter((call) =>
      call.table === 'whatsapp_chat_tags' && call.method === 'in'
    );
    expect(batches).toHaveLength(2);
    expect(batches.flatMap((call) => call.args[1] as string[])).toEqual(tagIds);
  });
});

describe('loadOfficialAnswers', () => {
  it('loads only pinned active snippets and active FAQs with deterministic limits and order', async () => {
    const { client, calls } = createSupabaseDouble({
      whatsapp_snippets: [
        {
          shortcut: '/zeta',
          label: 'Zeta',
          body: 'Respuesta zeta',
          is_active: true,
          is_pinned: true,
          sort_order: 2,
        },
        {
          shortcut: '/alpha',
          label: 'Alpha',
          body: 'Respuesta alpha',
          is_active: true,
          is_pinned: true,
          sort_order: 1,
        },
        {
          shortcut: '/inactive',
          label: 'No',
          body: 'No debe aparecer',
          is_active: false,
          is_pinned: true,
          sort_order: 0,
        },
        {
          shortcut: '/unpinned',
          label: 'No',
          body: 'No debe aparecer',
          is_active: true,
          is_pinned: false,
          sort_order: 0,
        },
      ],
      crm_faqs: [
        {
          question: '¿Cuál es la cobertura?',
          answer: 'Bogotá y Medellín.',
          category: 'cobertura',
          keywords: ['ciudades'],
          is_active: true,
        },
        {
          question: 'FAQ inactiva',
          answer: 'No debe aparecer',
          category: null,
          keywords: [],
          is_active: false,
        },
      ],
    });

    const result = await loadOfficialAnswers(client);

    expect(result.snippets.map((entry) => entry.shortcut)).toEqual(['/alpha', '/zeta']);
    expect(result.faqs).toEqual([{
      question: '¿Cuál es la cobertura?',
      answer: 'Bogotá y Medellín.',
      category: 'cobertura',
      keywords: ['ciudades'],
    }]);
    expect(calls).toContainEqual({
      table: 'whatsapp_snippets',
      method: 'limit',
      args: [OFFICIAL_ANSWERS_QUERY_LIMITS.snippets],
    });
    expect(calls).toContainEqual({
      table: 'crm_faqs',
      method: 'limit',
      args: [OFFICIAL_ANSWERS_QUERY_LIMITS.faqs],
    });
    expect(calls.filter((call) =>
      call.table === 'whatsapp_snippets' && call.method === 'order'
    ).map((call) => call.args[0])).toEqual(['sort_order', 'shortcut']);
  });

  it('clips oversized entries before returning them', async () => {
    const { client } = createSupabaseDouble({
      whatsapp_snippets: [{
        shortcut: `/${'s'.repeat(300)}`,
        label: 'L'.repeat(500),
        body: 'B'.repeat(5_000),
        is_active: true,
        is_pinned: true,
        sort_order: 0,
      }],
      crm_faqs: [{
        question: 'Q'.repeat(2_000),
        answer: 'A'.repeat(8_000),
        category: 'C'.repeat(500),
        keywords: ['K'.repeat(500)],
        is_active: true,
      }],
    });

    const result = await loadOfficialAnswers(client);

    expect(result.snippets[0]?.shortcut).toMatch(/…$/);
    expect(result.snippets[0]?.label).toMatch(/…$/);
    expect(result.snippets[0]?.body).toMatch(/…$/);
    expect(result.faqs[0]?.question).toMatch(/…$/);
    expect(result.faqs[0]?.answer).toMatch(/…$/);
    expect(result.faqs[0]?.category).toMatch(/…$/);
    expect(result.faqs[0]?.keywords[0]).toMatch(/…$/);
  });

  it('degrades query failures to empty lists and structured warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client } = createSupabaseDouble(
      {},
      {
        whatsapp_snippets: new Error('snippets unavailable'),
        crm_faqs: new Error('faqs unavailable'),
      },
    );

    await expect(loadOfficialAnswers(client)).resolves.toEqual({
      snippets: [],
      faqs: [],
    });
    const warnings = warn.mock.calls.map(([value]) => JSON.parse(String(value)));
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'inbox-ai-context',
        event: 'official-snippets-query-failed',
      }),
      expect.objectContaining({
        scope: 'inbox-ai-context',
        event: 'official-faqs-query-failed',
      }),
    ]));
    warn.mockRestore();
  });
});

describe('loadDirectoryByPhone', () => {
  it('maps operational classification fields from the bounded phone lookup', async () => {
    const { client, calls } = createSupabaseDouble({
      crm_directory: [{
        id: 'directory-1',
        phone: '+573001112233',
        full_name: 'Ana Pérez',
        display_name: 'Ana',
        source: 'whatsapp',
        service_id: 'cleaning',
        classification: 'client',
        payment_status: 'pending',
        opt_out: true,
        notes: 'Prefiere la tarde',
        internal_notes: 'VIP',
        tags: ['Bogotá'],
        metadata: { city: 'Bogotá' },
        updated_at: '2026-08-06T10:00:00.000Z',
      }],
    });

    const result = await loadDirectoryByPhone(client, '+573001112233');

    expect(result).toMatchObject({
      id: 'directory-1',
      fullName: 'Ana',
      source: 'whatsapp',
      serviceId: 'cleaning',
      classification: 'client',
      paymentStatus: 'pending',
      optOut: true,
      notesSummary: 'Prefiere la tarde | VIP',
    });
    expect(calls).toContainEqual({
      table: 'crm_directory',
      method: 'limit',
      args: [5],
    });
  });
});
