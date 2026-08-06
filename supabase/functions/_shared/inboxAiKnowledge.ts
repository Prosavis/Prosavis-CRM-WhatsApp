// deno-lint-ignore-file no-explicit-any
/** Carga server-side de conocimiento operativo para el AI del Inbox. */

import {
  directoryPhoneKey,
  directoryPhoneLookupVariants,
  normalizeDirectoryPhoneE164,
} from './directoryPhone.ts';
import type { InboxAiDirectory } from './inboxAiContextFormat.ts';

type SupabaseClient = any;

const CONVERSATION_TAG_QUERY_BATCH_SIZE = 100;
const DIRECTORY_QUERY_LIMIT = 5;
const DIRECTORY_NOTES_MAX = 400;
const SNIPPET_SHORTCUT_MAX = 80;
const SNIPPET_LABEL_MAX = 160;
const SNIPPET_BODY_MAX = 900;
const FAQ_QUESTION_MAX = 300;
const FAQ_ANSWER_MAX = 1_200;
const FAQ_CATEGORY_MAX = 100;
const FAQ_KEYWORD_MAX = 80;
const FAQ_KEYWORDS_MAX = 12;

export const OFFICIAL_ANSWERS_QUERY_LIMITS = {
  snippets: 20,
  faqs: 20,
} as const;

export interface InboxAiConversationContext {
  tags: string[];
  adminNotes: string | null;
  assignedTo: string | null;
  lastIntent: string | null;
  automatedInboundDisabled: boolean;
}

export interface InboxAiOfficialSnippet {
  shortcut: string;
  label: string;
  body: string;
}

export interface InboxAiOfficialFaq {
  question: string;
  answer: string;
  category: string | null;
  keywords: string[];
}

export interface InboxAiOfficialAnswers {
  snippets: InboxAiOfficialSnippet[];
  faqs: InboxAiOfficialFaq[];
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function clipEntry(value: unknown, maxChars: number): string | null {
  const text = asTrimmedString(value);
  if (!text) return null;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function structuredWarning(event: string, error: unknown): void {
  console.warn(
    JSON.stringify({
      scope: 'inbox-ai-context',
      event,
      error: String((error as Error)?.message ?? error),
    }),
  );
}

function cityFromDirectoryRow(row: Record<string, unknown>): string | null {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return asTrimmedString((metadata as Record<string, unknown>).city);
}

function clipDirectoryNotes(row: Record<string, unknown>): string | null {
  const notes = [
    asTrimmedString(row.notes),
    asTrimmedString(row.internal_notes),
  ].filter((value): value is string => Boolean(value)).join(' | ');
  return clipEntry(notes, DIRECTORY_NOTES_MAX);
}

export async function loadConversationContext(
  supabase: SupabaseClient,
  stableKey: string,
): Promise<InboxAiConversationContext> {
  const { data: conversation, error: conversationError } = await supabase
    .from('whatsapp_conversations')
    .select('tag_ids, admin_notes, assigned_to, last_intent, automated_inbound_disabled')
    .eq('stable_key', stableKey)
    .limit(1)
    .maybeSingle();
  if (conversationError) throw conversationError;

  const tagIds: string[] = Array.isArray(conversation?.tag_ids)
    ? conversation.tag_ids.filter((id: unknown): id is string =>
      typeof id === 'string' && id.length > 0
    )
    : [];
  const tags: string[] = [];

  if (tagIds.length > 0) {
    const namesById = new Map<string, string>();
    for (
      let start = 0;
      start < tagIds.length;
      start += CONVERSATION_TAG_QUERY_BATCH_SIZE
    ) {
      const batch = tagIds.slice(start, start + CONVERSATION_TAG_QUERY_BATCH_SIZE);
      const { data: tagRows, error: tagsError } = await supabase
        .from('whatsapp_chat_tags')
        .select('id, name, archived')
        .in('id', batch)
        .eq('archived', false);
      if (tagsError) throw tagsError;

      for (const row of tagRows ?? []) {
        const id = asTrimmedString(row?.id);
        const name = asTrimmedString(row?.name);
        if (id && name) namesById.set(id, name);
      }
    }
    tags.push(...tagIds.map((id) => namesById.get(id)).filter(
      (name): name is string => Boolean(name),
    ));
  }

  return {
    tags,
    adminNotes: asTrimmedString(conversation?.admin_notes),
    assignedTo: asTrimmedString(conversation?.assigned_to),
    lastIntent: asTrimmedString(conversation?.last_intent),
    automatedInboundDisabled: conversation?.automated_inbound_disabled === true,
  };
}

export async function loadDirectoryByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<InboxAiDirectory | null> {
  const e164 = normalizeDirectoryPhoneE164(phone) ?? phone;
  const variants = directoryPhoneLookupVariants(e164);
  const lookupPhones = variants.length > 0 ? variants : [phone];

  const { data: rows, error } = await supabase
    .from('crm_directory')
    .select(
      'id, full_name, display_name, phone, email, address, preferred_service_address_line, notes, internal_notes, tags, app_user_id, source, service_id, classification, payment_status, opt_out, metadata',
    )
    .in('phone', lookupPhones)
    .order('updated_at', { ascending: false })
    .limit(DIRECTORY_QUERY_LIMIT);
  if (error) throw error;

  const targetKey = directoryPhoneKey(phone);
  const row = (rows ?? []).find((candidate: Record<string, unknown>) => {
    const key = directoryPhoneKey(asTrimmedString(candidate.phone));
    return Boolean(targetKey && key && key === targetKey);
  }) ?? (rows ?? [])[0] ?? null;
  if (!row) return null;

  const tags = Array.isArray(row.tags)
    ? row.tags
      .map((tag: unknown) => asTrimmedString(tag))
      .filter((tag: string | null): tag is string => Boolean(tag))
    : [];
  const appUserId = asTrimmedString(row.app_user_id);

  return {
    id: String(row.id),
    fullName: asTrimmedString(row.display_name) ?? asTrimmedString(row.full_name),
    email: asTrimmedString(row.email),
    address: asTrimmedString(row.address),
    preferredServiceAddress: asTrimmedString(row.preferred_service_address_line),
    city: cityFromDirectoryRow(row),
    tags,
    appUserId,
    notesSummary: clipDirectoryNotes(row),
    source: asTrimmedString(row.source),
    serviceId: asTrimmedString(row.service_id),
    classification: asTrimmedString(row.classification),
    paymentStatus: asTrimmedString(row.payment_status),
    optOut: row.opt_out === true,
    isReturningClient: Boolean(appUserId),
  };
}

async function loadOfficialSnippets(
  supabase: SupabaseClient,
): Promise<InboxAiOfficialSnippet[]> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_snippets')
      .select('shortcut, label, body')
      .eq('is_active', true)
      .eq('is_pinned', true)
      .order('sort_order', { ascending: true })
      .order('shortcut', { ascending: true })
      .limit(OFFICIAL_ANSWERS_QUERY_LIMITS.snippets);
    if (error) throw error;

    return (data ?? []).flatMap((row: Record<string, unknown>) => {
      const shortcut = clipEntry(row.shortcut, SNIPPET_SHORTCUT_MAX);
      const body = clipEntry(row.body, SNIPPET_BODY_MAX);
      if (!shortcut || !body) return [];
      return [{
        shortcut,
        label: clipEntry(row.label, SNIPPET_LABEL_MAX) ?? shortcut,
        body,
      }];
    });
  } catch (error) {
    structuredWarning('official-snippets-query-failed', error);
    return [];
  }
}

async function loadOfficialFaqs(
  supabase: SupabaseClient,
): Promise<InboxAiOfficialFaq[]> {
  try {
    const { data, error } = await supabase
      .from('crm_faqs')
      .select('question, answer, category, keywords')
      .eq('is_active', true)
      .limit(OFFICIAL_ANSWERS_QUERY_LIMITS.faqs);
    if (error) throw error;

    return (data ?? []).flatMap((row: Record<string, unknown>) => {
      const question = clipEntry(row.question, FAQ_QUESTION_MAX);
      const answer = clipEntry(row.answer, FAQ_ANSWER_MAX);
      if (!question || !answer) return [];
      const keywords = Array.isArray(row.keywords)
        ? row.keywords
          .slice(0, FAQ_KEYWORDS_MAX)
          .map((keyword) => clipEntry(keyword, FAQ_KEYWORD_MAX))
          .filter((keyword): keyword is string => Boolean(keyword))
        : [];
      return [{
        question,
        answer,
        category: clipEntry(row.category, FAQ_CATEGORY_MAX),
        keywords,
      }];
    });
  } catch (error) {
    structuredWarning('official-faqs-query-failed', error);
    return [];
  }
}

export async function loadOfficialAnswers(
  supabase: SupabaseClient,
): Promise<InboxAiOfficialAnswers> {
  const [snippets, faqs] = await Promise.all([
    loadOfficialSnippets(supabase),
    loadOfficialFaqs(supabase),
  ]);
  return { snippets, faqs };
}
