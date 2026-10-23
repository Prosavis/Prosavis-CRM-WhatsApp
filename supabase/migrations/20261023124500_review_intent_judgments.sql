-- Juicio en sombra antes de pedir reseña. No envía mensajes.

create table if not exists public.whatsapp_review_intent_judgments (
  id uuid primary key default gen_random_uuid(),
  appointment_id text not null,
  conversation_stable_key text not null,
  recipient_phone text,
  burst_text text not null default '',
  label text not null,
  quotes jsonb not null default '[]'::jsonb,
  veto_reasons jsonb not null default '[]'::jsonb,
  eligible boolean not null default false,
  has_complaint boolean not null default false,
  send_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_review_intent_judgments_label_check check (
    label in (
      'positivo',
      'positivo_y_reagendar',
      'solo_gracias',
      'solo_reagendar',
      'queja',
      'mixto',
      'no_se_entiende'
    )
  ),
  constraint whatsapp_review_intent_judgments_send_off check (send_enabled = false)
);

create unique index if not exists whatsapp_review_intent_judgments_appointment_idx
  on public.whatsapp_review_intent_judgments (appointment_id);

create index if not exists whatsapp_review_intent_judgments_stable_key_idx
  on public.whatsapp_review_intent_judgments (conversation_stable_key, updated_at desc);

alter table public.whatsapp_conversations
  add column if not exists review_intent_mark text,
  add column if not exists review_intent_label text;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_review_intent_mark_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_review_intent_mark_check
  check (review_intent_mark is null or review_intent_mark in ('apto', 'queja', 'no_pedir'));

alter table public.whatsapp_review_intent_judgments enable row level security;

drop policy if exists "CRM admins read review intent judgments"
  on public.whatsapp_review_intent_judgments;
create policy "CRM admins read review intent judgments"
on public.whatsapp_review_intent_judgments for select to authenticated
using (app_private.is_crm_admin());
