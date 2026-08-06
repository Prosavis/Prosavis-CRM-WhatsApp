-- V5 Phase 1.5: client visits, complaints, routes and commercial follow-ups.
-- Firestore client references remain stable external identifiers; directory_id
-- links the unified CRM record when one is available.

create table if not exists public.visit_routes (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  route_date date not null,
  status text not null default 'draft',
  weekly_quota integer not null,
  completed_this_week integer not null default 0,
  effective_quota integer not null,
  cooldown_days integer not null default 30,
  stops jsonb not null default '[]'::jsonb,
  excluded jsonb not null default '[]'::jsonb,
  generated_by text not null,
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_routes_service_id_id_key unique (service_id, id),
  constraint visit_routes_idempotency_key unique (service_id, idempotency_key),
  constraint visit_routes_status_check check (
    status in ('draft', 'published', 'in_progress', 'completed', 'canceled')
  ),
  constraint visit_routes_quota_check check (
    weekly_quota >= 0
    and completed_this_week >= 0
    and effective_quota >= 0
    and effective_quota <= weekly_quota
  ),
  constraint visit_routes_cooldown_check check (cooldown_days between 0 and 365),
  constraint visit_routes_stops_array_check check (jsonb_typeof(stops) = 'array'),
  constraint visit_routes_excluded_array_check check (jsonb_typeof(excluded) = 'array'),
  constraint visit_routes_completion_check check (
    status <> 'completed' or completed_at is not null
  ),
  constraint visit_routes_idempotency_nonempty_check check (
    length(trim(idempotency_key)) between 8 and 200
  )
);

create table if not exists public.client_visits (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  client_reference text not null,
  directory_id uuid references public.crm_directory (id) on delete set null,
  route_id uuid,
  route_sequence integer,
  visit_type text not null default 'routine',
  status text not null default 'completed',
  scheduled_for date,
  visited_at timestamptz,
  satisfaction smallint,
  notes text,
  performed_by text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_visits_service_id_id_key unique (service_id, id),
  constraint client_visits_idempotency_key unique (service_id, idempotency_key),
  constraint client_visits_route_fkey foreign key (service_id, route_id)
    references public.visit_routes (service_id, id),
  constraint client_visits_client_reference_check check (
    length(trim(client_reference)) between 1 and 200
  ),
  constraint client_visits_type_check check (
    visit_type in ('routine', 'complaint', 'follow_up', 'referral')
  ),
  constraint client_visits_status_check check (
    status in ('scheduled', 'completed', 'canceled', 'no_contact')
  ),
  constraint client_visits_satisfaction_check check (
    satisfaction is null or satisfaction between 1 and 5
  ),
  constraint client_visits_completed_check check (
    status <> 'completed'
    or (visited_at is not null and satisfaction is not null)
  ),
  constraint client_visits_route_sequence_check check (
    route_sequence is null or route_sequence >= 1
  ),
  constraint client_visits_idempotency_nonempty_check check (
    length(trim(idempotency_key)) between 8 and 200
  )
);

create table if not exists public.quejas (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  client_reference text not null,
  directory_id uuid references public.crm_directory (id) on delete set null,
  source_visit_id uuid,
  booking_id uuid,
  category text not null default 'service_quality',
  severity text not null default 'medium',
  status text not null default 'open',
  summary text not null,
  details text,
  opened_at timestamptz not null default now(),
  attention_due_on date not null default ((now() at time zone 'America/Bogota')::date),
  resolved_at timestamptz,
  resolved_by text,
  resolution text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quejas_service_id_id_key unique (service_id, id),
  constraint quejas_idempotency_key unique (service_id, idempotency_key),
  constraint quejas_visit_fkey foreign key (service_id, source_visit_id)
    references public.client_visits (service_id, id),
  constraint quejas_booking_fkey foreign key (service_id, booking_id)
    references public.bookings (service_id, id),
  constraint quejas_client_reference_check check (
    length(trim(client_reference)) between 1 and 200
  ),
  constraint quejas_category_check check (
    category in (
      'service_quality',
      'cleaner_conduct',
      'damage',
      'access',
      'billing',
      'other'
    )
  ),
  constraint quejas_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint quejas_status_check check (
    status in ('open', 'in_progress', 'resolved', 'dismissed')
  ),
  constraint quejas_summary_check check (
    length(trim(summary)) between 3 and 500
  ),
  constraint quejas_resolution_check check (
    (status in ('open', 'in_progress') and resolved_at is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null)
  ),
  constraint quejas_idempotency_nonempty_check check (
    length(trim(idempotency_key)) between 8 and 200
  )
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  client_reference text not null,
  directory_id uuid references public.crm_directory (id) on delete set null,
  source_visit_id uuid not null,
  referred_name text not null,
  referred_phone text,
  referred_email text,
  relationship text,
  status text not null default 'lead',
  idempotency_key text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_service_id_id_key unique (service_id, id),
  constraint referrals_idempotency_key unique (service_id, idempotency_key),
  constraint referrals_visit_fkey foreign key (service_id, source_visit_id)
    references public.client_visits (service_id, id) on delete cascade,
  constraint referrals_client_reference_check check (
    length(trim(client_reference)) between 1 and 200
  ),
  constraint referrals_name_check check (
    length(trim(referred_name)) between 2 and 200
  ),
  constraint referrals_contact_check check (
    nullif(trim(coalesce(referred_phone, '')), '') is not null
    or nullif(trim(coalesce(referred_email, '')), '') is not null
  ),
  constraint referrals_status_check check (
    status in ('lead', 'contacted', 'qualified', 'booked', 'lost', 'opted_out')
  ),
  constraint referrals_idempotency_nonempty_check check (
    length(trim(idempotency_key)) between 8 and 200
  )
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  client_reference text not null,
  directory_id uuid references public.crm_directory (id) on delete set null,
  source_visit_id uuid,
  source_referral_id uuid,
  opportunity_type text not null,
  status text not null default 'open',
  title text not null,
  estimated_value_cop bigint not null default 0,
  next_action_on date,
  notes text,
  owner_id text,
  idempotency_key text not null,
  won_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_service_id_id_key unique (service_id, id),
  constraint opportunities_idempotency_key unique (service_id, idempotency_key),
  constraint opportunities_visit_fkey foreign key (service_id, source_visit_id)
    references public.client_visits (service_id, id),
  constraint opportunities_referral_fkey foreign key (
    service_id,
    source_referral_id
  ) references public.referrals (service_id, id),
  constraint opportunities_client_reference_check check (
    length(trim(client_reference)) between 1 and 200
  ),
  constraint opportunities_source_check check (
    source_visit_id is not null or source_referral_id is not null
  ),
  constraint opportunities_type_check check (
    opportunity_type in ('rebooking', 'upsell', 'recovery', 'referral')
  ),
  constraint opportunities_status_check check (
    status in ('open', 'contacted', 'won', 'lost', 'dismissed')
  ),
  constraint opportunities_title_check check (
    length(trim(title)) between 3 and 200
  ),
  constraint opportunities_value_check check (estimated_value_cop >= 0),
  constraint opportunities_outcome_check check (
    (status = 'won' and won_at is not null and lost_at is null)
    or (status = 'lost' and lost_at is not null and won_at is null)
    or (status not in ('won', 'lost') and won_at is null and lost_at is null)
  ),
  constraint opportunities_idempotency_nonempty_check check (
    length(trim(idempotency_key)) between 8 and 200
  )
);

create unique index if not exists opportunities_one_referral_lead_idx
  on public.opportunities (service_id, source_referral_id)
  where source_referral_id is not null;
create index if not exists visit_routes_service_date_idx
  on public.visit_routes (service_id, route_date, status);
create index if not exists client_visits_service_client_date_idx
  on public.client_visits (service_id, client_reference, visited_at desc);
create index if not exists client_visits_route_idx
  on public.client_visits (service_id, route_id, route_sequence)
  where route_id is not null;
create index if not exists quejas_attention_today_idx
  on public.quejas (service_id, attention_due_on, severity)
  where status in ('open', 'in_progress');
create index if not exists referrals_service_status_idx
  on public.referrals (service_id, status, created_at desc);
create index if not exists opportunities_follow_up_idx
  on public.opportunities (service_id, next_action_on, status)
  where status in ('open', 'contacted');

drop trigger if exists set_visit_routes_updated_at on public.visit_routes;
create trigger set_visit_routes_updated_at
before update on public.visit_routes
for each row execute function public.set_updated_at();

drop trigger if exists set_client_visits_updated_at on public.client_visits;
create trigger set_client_visits_updated_at
before update on public.client_visits
for each row execute function public.set_updated_at();

drop trigger if exists set_quejas_updated_at on public.quejas;
create trigger set_quejas_updated_at
before update on public.quejas
for each row execute function public.set_updated_at();

drop trigger if exists set_referrals_updated_at on public.referrals;
create trigger set_referrals_updated_at
before update on public.referrals
for each row execute function public.set_updated_at();

drop trigger if exists set_opportunities_updated_at on public.opportunities;
create trigger set_opportunities_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

alter table public.visit_routes enable row level security;
alter table public.client_visits enable row level security;
alter table public.quejas enable row level security;
alter table public.referrals enable row level security;
alter table public.opportunities enable row level security;

drop policy if exists visit_routes_admin_all on public.visit_routes;
create policy visit_routes_admin_all
on public.visit_routes for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists client_visits_admin_all on public.client_visits;
create policy client_visits_admin_all
on public.client_visits for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists quejas_admin_all on public.quejas;
create policy quejas_admin_all
on public.quejas for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists referrals_admin_all on public.referrals;
create policy referrals_admin_all
on public.referrals for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists opportunities_admin_all on public.opportunities;
create policy opportunities_admin_all
on public.opportunities for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

revoke all on table
  public.visit_routes,
  public.client_visits,
  public.quejas,
  public.referrals,
  public.opportunities
from public, anon;

grant select, insert, update, delete on table
  public.visit_routes,
  public.client_visits,
  public.quejas,
  public.referrals,
  public.opportunities
to authenticated;

grant select, insert, update, delete on table
  public.visit_routes,
  public.client_visits,
  public.quejas,
  public.referrals,
  public.opportunities
to service_role;
