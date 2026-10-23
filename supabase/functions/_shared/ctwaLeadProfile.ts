import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type CtwaRouteAction = 'hogar' | 'empresas' | 'empleo';

export type CtwaLeadChoice = 'domestica' | 'empresarial' | 'empleo';

/** Nombres del catálogo whatsapp_chat_tags. No crear otros. */
export const CTWA_ROUTE_TAG: Record<CtwaRouteAction, string> = {
  hogar: 'Cliente Potencial',
  empresas: 'Empresas',
  empleo: 'Job',
};

const VIGENTE_BY_ACTION: Record<CtwaRouteAction, string> = {
  hogar: 'Anuncio 312, doméstica. Aún no da dirección ni fecha.',
  empresas: 'Anuncio 312, empresarial. Aún no da tipo de espacio.',
  empleo: 'Anuncio 312, empleo.',
};

const BRANCH_LABEL: Record<CtwaRouteAction, string> = {
  hogar: 'doméstica',
  empresas: 'empresarial',
  empleo: 'empleo',
};

export function choiceForRoute(action: CtwaRouteAction): CtwaLeadChoice {
  switch (action) {
    case 'hogar':
      return 'domestica';
    case 'empresas':
      return 'empresarial';
    case 'empleo':
      return 'empleo';
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export function writesContextSheet(action: CtwaRouteAction): boolean {
  return action !== 'empleo';
}

export function bogotaStamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

export function adminNoteLine(input: {
  action: CtwaRouteAction;
  adId: string | null;
  now?: Date;
}): string {
  const ad = input.adId?.trim() || 'sin id';
  return `${BRANCH_LABEL[input.action]} · anuncio ${ad} · ${bogotaStamp(input.now)}`;
}

export function appendAdminNote(existing: string | null | undefined, line: string): string {
  const current = (existing ?? '').trim();
  if (!line.trim()) return current;
  if (current.split('\n').some((row) => row.trim() === line)) return current;
  return current ? `${current}\n${line}` : line;
}

function diaryBody(existing: string): { structured: boolean; diary: string; legado: string } {
  const trimmed = existing.trim();
  if (!trimmed) return { structured: false, diary: '', legado: '' };
  const diarioMatch = trimmed.match(/^## Diario\s*$/m);
  if (diarioMatch && diarioMatch.index != null) {
    return {
      structured: true,
      diary: trimmed.slice(diarioMatch.index + diarioMatch[0].length).trim(),
      legado: '',
    };
  }
  const withoutVigente = trimmed
    .replace(/^\[Vigente [^\]]*\]\s*/m, '')
    .replace(/^---\s*/m, '')
    .trim();
  if (/^\[Vigente /m.test(trimmed) && !withoutVigente) {
    return { structured: true, diary: '', legado: '' };
  }
  return { structured: false, diary: '', legado: withoutVigente || trimmed };
}

/** Misma forma que mergeContextSheet: vigente arriba, diario abajo, sin borrar lo anterior. */
export function vigenteIsEmpty(existing: string | null | undefined): boolean {
  const trimmed = String(existing ?? '').trim();
  if (!trimmed) return true;
  const match = trimmed.match(/^\[Vigente [^\]]*\]\s*([\s\S]*?)(?:\n---|\n## Diario|$)/);
  if (!match) return false;
  return !match[1].trim();
}

export function appendProfileDiary(existing: string, line: string, now?: Date): string {
  const stamp = bogotaStamp(now ?? new Date());
  const block = `### ${stamp} · bot 312\n${line.trim()}`;
  const trimmed = existing.trim();
  if (!trimmed.includes('## Diario')) return `${trimmed}\n\n## Diario\n${block}\n`;
  return `${trimmed}\n\n${block}\n`;
}

export function appendRouteContextSheet(input: {
  existing: string | null | undefined;
  action: CtwaRouteAction;
  now?: Date;
  vigente?: string;
}): string {
  const now = input.now ?? new Date();
  const stamp = bogotaStamp(now);
  const vigente = input.vigente?.trim() || VIGENTE_BY_ACTION[input.action];
  const block = `### ${stamp} · bot 312\n${vigente}`;
  const { structured, diary, legado } = diaryBody(String(input.existing ?? ''));
  const parts: string[] = [];
  if (!structured && legado) parts.push(`### ${stamp} · campo\n${legado}`);
  else if (diary) parts.push(diary);
  parts.push(block);
  return `[Vigente ${stamp} Bogotá] ${vigente}\n---\n## Diario\n${parts.join('\n\n')}\n`;
}

export function ctwaLeadWebhookEnv(env: Record<string, string | undefined>): {
  url?: string;
  secret?: string;
} {
  const url = (env.GROK_CTWA_LEAD_WEBHOOK_URL ?? '').trim();
  const secret = (env.GROK_CTWA_LEAD_WEBHOOK_SECRET ?? '').trim();
  return {
    url: url && url !== 'UNSET' && url !== 'unset' ? url : undefined,
    secret: secret && secret !== 'UNSET' && secret !== 'unset' ? secret : undefined,
  };
}

function usableName(value: string | null | undefined, phone: string): string | null {
  const name = (value ?? '').trim();
  if (!name || name === phone) return null;
  return name;
}

type DirectoryHit = {
  id: string;
  full_name: string | null;
  internal_notes: string | null;
  whatsapp_conversation_id: string | null;
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function findDirectory(
  supabase: SupabaseClient,
  stableKey: string,
  phone: string,
): Promise<DirectoryHit | null> {
  const filters = [`whatsapp_conversation_id.eq.${stableKey}`];
  if (phone) {
    filters.push(`phone.eq.${phone}`, `phone.eq.+${phone}`);
  }
  const { data, error } = await supabase
    .from('crm_directory')
    .select('id, full_name, internal_notes, whatsapp_conversation_id')
    .or(filters.join(','))
    .limit(5);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DirectoryHit[];
  return rows.find((row) => row.whatsapp_conversation_id === stableKey) ?? rows[0] ?? null;
}

async function addChatTag(
  supabase: SupabaseClient,
  stableKey: string,
  tagName: string,
): Promise<'added' | 'present' | 'missing'> {
  const { data: tagRow, error: tagError } = await supabase
    .from('whatsapp_chat_tags')
    .select('id')
    .eq('name', tagName)
    .eq('archived', false)
    .maybeSingle();
  if (tagError) throw new Error(tagError.message);
  const tagId = asText(tagRow?.id);
  if (!tagId) return 'missing';

  const { data: conv, error: convError } = await supabase
    .from('whatsapp_conversations')
    .select('tag_ids')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (convError) throw new Error(convError.message);
  const ids = Array.isArray(conv?.tag_ids) ? conv.tag_ids.map(String) : [];
  if (ids.includes(tagId)) return 'present';
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ tag_ids: [...ids, tagId] })
    .eq('stable_key', stableKey);
  if (error) throw new Error(error.message);
  return 'added';
}

async function ensureIntakeMemory(
  supabase: SupabaseClient,
  stableKey: string,
  action: CtwaRouteAction,
  now: Date,
  summary?: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('whatsapp_conversation_ai_memory')
    .select('stable_key, summary')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const { error: insertError } = await supabase
    .from('whatsapp_conversation_ai_memory')
    .upsert({
      stable_key: stableKey,
      summary: summary?.trim() || `Primera intención: ${BRANCH_LABEL[action]}.`,
      preferences: [],
      objections: [],
      agreements: [],
      message_count: 1,
      model: 'reglas',
      updated_at: now.toISOString(),
    }, { onConflict: 'stable_key' });
  if (insertError) throw new Error(insertError.message);
}

function defer(task: Promise<unknown>): void {
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return;
  }
  void task.catch((error) => console.error('ctwa grok webhook skipped', error));
}

/** Ficha, tag, nota y hoja. No lanza: el mensaje al cliente ya salió. */
export async function stampCtwaLead(params: {
  supabase: SupabaseClient;
  stableKey: string;
  to: string;
  action: CtwaRouteAction;
  now?: Date;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  profileSentence?: string;
}): Promise<void> {
  try {
    const now = params.now ?? new Date();
    const phone = params.to.replace(/\D/g, '');
    const { data: conv, error: convError } = await params.supabase
      .from('whatsapp_conversations')
      .select('contact_name, whatsapp_profile_name, ctwa_source_id, admin_notes')
      .eq('stable_key', params.stableKey)
      .maybeSingle();
    if (convError) throw new Error(convError.message);

    const existing = phone || params.stableKey
      ? await findDirectory(params.supabase, params.stableKey, phone)
      : null;
    const name = usableName(asText(conv?.contact_name), phone)
      ?? usableName(asText(conv?.whatsapp_profile_name), phone);
    const entry: Record<string, unknown> = {
      whatsapp_conversation_id: params.stableKey,
      source: 'WHATSAPP',
      channels: ['WHATSAPP'],
    };
    if (phone) entry.phone = phone;
    if (existing?.id) entry.id = existing.id;
    else if (name) {
      entry.full_name = name;
      entry.display_name = name;
    }

    const { data: directoryIdRaw, error: upsertError } = await params.supabase.rpc(
      'upsert_directory_entry',
      {
        p_entry: entry,
        p_overwrite_classification: false,
        p_replace_tags: false,
      },
    );
    if (upsertError) throw new Error(upsertError.message);
    const directoryId = asText(directoryIdRaw) || existing?.id || null;

    const tagStatus = await addChatTag(
      params.supabase,
      params.stableKey,
      CTWA_ROUTE_TAG[params.action],
    );
    if (tagStatus === 'missing') {
      console.error('ctwa lead tag missing', CTWA_ROUTE_TAG[params.action]);
    }

    if (params.action === 'empleo' && tagStatus === 'present' && directoryId) {
      const { error: ingestError } = await params.supabase.rpc(
        'ingest_job_application_from_conversation',
        {
          p_stable_key: params.stableKey,
          p_actor_kind: 'system',
          p_actor_id: 'ctwa-ad-menu',
          p_actor_label: 'Menú de anuncio',
          p_origin: 'tag',
        },
      );
      if (ingestError) console.error('ctwa job ingest skipped', ingestError.message);
    }

    const note = adminNoteLine({
      action: params.action,
      adId: asText(conv?.ctwa_source_id) || null,
      now,
    });
    const { error: noteError } = await params.supabase
      .from('whatsapp_conversations')
      .update({ admin_notes: appendAdminNote(asText(conv?.admin_notes), note) })
      .eq('stable_key', params.stableKey);
    if (noteError) throw new Error(noteError.message);

    const sentence = params.profileSentence?.trim() || '';
    if (directoryId && sentence && !vigenteIsEmpty(existing?.internal_notes)) {
      const sheet = appendProfileDiary(String(existing?.internal_notes ?? ''), sentence, now);
      const { error: sheetError } = await params.supabase
        .from('crm_directory')
        .update({ internal_notes: sheet })
        .eq('id', directoryId);
      if (sheetError) throw new Error(sheetError.message);
    } else if (directoryId && vigenteIsEmpty(existing?.internal_notes)) {
      const sheet = appendRouteContextSheet({
        existing: existing?.internal_notes,
        action: params.action,
        now,
        vigente: sentence || undefined,
      });
      const { error: sheetError } = await params.supabase
        .from('crm_directory')
        .update({ internal_notes: sheet })
        .eq('id', directoryId);
      if (sheetError) throw new Error(sheetError.message);
    }
    try {
      await ensureIntakeMemory(params.supabase, params.stableKey, params.action, now, sentence);
    } catch (error) {
      console.error('intake memory skipped', error);
    }

    const webhook = ctwaLeadWebhookEnv(params.env ?? {
      GROK_CTWA_LEAD_WEBHOOK_URL: Deno.env.get('GROK_CTWA_LEAD_WEBHOOK_URL'),
      GROK_CTWA_LEAD_WEBHOOK_SECRET: Deno.env.get('GROK_CTWA_LEAD_WEBHOOK_SECRET'),
    });
    if (!webhook.url || !directoryId) return;
    const fetchImpl = params.fetchImpl ?? fetch;
    defer((async () => {
      const response = await fetchImpl(webhook.url as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhook.secret ? { Authorization: `Bearer ${webhook.secret}` } : {}),
        },
        body: JSON.stringify({
          stableKey: params.stableKey,
          directoryId,
          choice: choiceForRoute(params.action),
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        console.error('ctwa grok webhook skipped', response.status);
      }
    })());
  } catch (error) {
    console.error('ctwa lead profile skipped', error);
  }
}
