-- V5 Phase 0A: operational foundation for Firestore appointment projections.
-- Firestore remains the transactional source of truth.

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  name text not null,
  building_type text not null,
  unit_count integer not null default 0,
  admin_contact_name text,
  admin_contact_phone text,
  admin_contact_email text,
  barrio text,
  comuna text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  has_common_areas boolean not null default false,
  average_actual_service_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buildings_service_id_id_key unique (service_id, id),
  constraint buildings_type_check check (
    building_type in ('conjunto', 'edificio', 'casa', 'comercial', 'hotel', 'airbnb')
  ),
  constraint buildings_unit_count_check check (unit_count >= 0),
  constraint buildings_latitude_check check (
    latitude is null or latitude between -90 and 90
  ),
  constraint buildings_longitude_check check (
    longitude is null or longitude between -180 and 180
  ),
  constraint buildings_average_actual_service_minutes_check check (
    average_actual_service_minutes is null or average_actual_service_minutes >= 0
  )
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  appointment_id text not null,
  source_revision bigint not null default 0,
  source_hash text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  status text not null default 'PENDING',
  tier text,
  required_cleaner_minutes integer not null default 0,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  fulfillment text not null default 'single',
  crew_size integer not null default 1,
  building_id uuid,
  location_address text,
  barrio text,
  comuna text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  client_id text,
  client_name text,
  client_phone text,
  client_app_user_id text,
  window_start timestamptz,
  window_end timestamptz,
  payment_status text not null default 'PAGO_PENDIENTE',
  payment_method text,
  payment_id text,
  wompi_reference text,
  wompi_transaction_id text,
  subtotal_cop bigint not null default 0,
  total_cop bigint not null default 0,
  paid_cop bigint not null default 0,
  pending_cop bigint not null default 0,
  is_first_booking boolean not null default false,
  acquisition_channel text,
  cac_cop bigint not null default 0,
  has_addons boolean not null default false,
  addon_total_cop bigint not null default 0,
  cancellation_fee_cop bigint not null default 0,
  assignment_source text,
  assignment_decision_id text,
  source_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_service_appointment_key unique (service_id, appointment_id),
  constraint bookings_service_id_id_key unique (service_id, id),
  constraint bookings_building_fkey foreign key (service_id, building_id)
    references public.buildings (service_id, id),
  constraint bookings_source_revision_check check (source_revision >= 0),
  constraint bookings_status_check check (
    status in (
      'PENDING',
      'PENDING_RESCHEDULE',
      'CONFIRMED',
      'EN_ROUTE',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELED',
      'REJECTED'
    )
  ),
  constraint bookings_payment_status_check check (
    payment_status in ('PAGO_PENDIENTE', 'PAGO_EN_PROCESO', 'PAGO_ACEPTADO')
  ),
  constraint bookings_payment_method_check check (
    payment_method is null or payment_method in ('WOMPI', 'QR', 'CASH')
  ),
  constraint bookings_fulfillment_check check (
    fulfillment in ('single', 'composite')
  ),
  constraint bookings_crew_size_check check (crew_size >= 1),
  constraint bookings_fulfillment_crew_size_check check (
    (fulfillment = 'single' and crew_size = 1)
    or (fulfillment = 'composite' and crew_size >= 2)
  ),
  constraint bookings_required_cleaner_minutes_check check (
    required_cleaner_minutes >= 0
  ),
  constraint bookings_scheduled_range_check check (
    scheduled_start is null
    or scheduled_end is null
    or scheduled_start < scheduled_end
  ),
  constraint bookings_window_range_check check (
    window_start is null
    or window_end is null
    or window_start < window_end
  ),
  constraint bookings_latitude_check check (
    latitude is null or latitude between -90 and 90
  ),
  constraint bookings_longitude_check check (
    longitude is null or longitude between -180 and 180
  ),
  constraint bookings_amounts_check check (
    subtotal_cop >= 0
    and total_cop >= 0
    and paid_cop >= 0
    and pending_cop >= 0
    and cac_cop >= 0
    and addon_total_cop >= 0
    and cancellation_fee_cop >= 0
  ),
  constraint bookings_assignment_source_check check (
    assignment_source is null
    or assignment_source in (
      'manual',
      'suggested_accepted',
      'suggested_overridden',
      'auto'
    )
  )
);

create table public.booking_crew (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  booking_id uuid not null,
  cleaner_id text not null,
  assigned_minutes integer not null default 0,
  is_lead boolean not null default false,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  ya_trabajaba_ese_dia boolean not null default false,
  estimated_marginal_cost_cop bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_crew_member_key unique (service_id, booking_id, cleaner_id),
  constraint booking_crew_booking_fkey foreign key (service_id, booking_id)
    references public.bookings (service_id, id) on delete cascade,
  constraint booking_crew_cleaner_fkey foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint booking_crew_assigned_minutes_check check (assigned_minutes >= 0),
  constraint booking_crew_scheduled_range_check check (
    scheduled_start is null
    or scheduled_end is null
    or scheduled_start < scheduled_end
  ),
  constraint booking_crew_actual_range_check check (
    actual_start is null
    or actual_end is null
    or actual_start < actual_end
  ),
  constraint booking_crew_estimated_marginal_cost_check check (
    estimated_marginal_cost_cop >= 0
  )
);

create table public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  booking_id uuid not null,
  addon_id text not null,
  minutes integer not null default 0,
  price_cop bigint not null default 0,
  sold_at text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_addons_booking_fkey foreign key (service_id, booking_id)
    references public.bookings (service_id, id) on delete cascade,
  constraint booking_addons_minutes_check check (minutes >= 0),
  constraint booking_addons_price_check check (price_cop >= 0),
  constraint booking_addons_sold_at_check check (
    sold_at in ('checkout', 'onsite', 'rebook')
  )
);

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  booking_id uuid not null,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  actor text,
  created_at timestamptz not null default now(),
  constraint booking_events_booking_fkey foreign key (service_id, booking_id)
    references public.bookings (service_id, id) on delete cascade,
  constraint booking_events_event_check check (
    event in (
      'creado',
      'confirmado',
      'reagendado',
      'reasignado',
      'en_proceso',
      'finalizado',
      'cancelado_cliente',
      'cancelado_operaria',
      'no_pudo_ingresar'
    )
  )
);

create table public.cleaner_availability (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  cleaner_id text not null,
  operational_date date not null,
  offered_minutes integer not null default 0,
  accepted_minutes integer not null default 0,
  window_start timestamptz,
  window_end timestamptz,
  unavailable_reason text not null default 'none',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaner_availability_day_key unique (
    service_id,
    cleaner_id,
    operational_date
  ),
  constraint cleaner_availability_cleaner_fkey foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint cleaner_availability_minutes_check check (
    offered_minutes >= 0
    and accepted_minutes >= 0
    and accepted_minutes <= offered_minutes
  ),
  constraint cleaner_availability_accepted_window_check check (
    accepted_minutes = 0
    or (window_start is not null and window_end is not null)
  ),
  constraint cleaner_availability_window_range_check check (
    window_start is null
    or window_end is null
    or window_start < window_end
  ),
  constraint cleaner_availability_reason_check check (
    unavailable_reason in (
      'none',
      'incapacidad',
      'vacaciones',
      'personal',
      'no_demand',
      'no_response'
    )
  ),
  constraint cleaner_availability_source_check check (
    source in ('manual', 'whatsapp', 'app')
  )
);

alter table public.crm_team_members
  add column hire_date date,
  add column labor_regime text not null default 'decreto_2616',
  add column home_comuna text,
  add column home_latitude numeric(9, 6),
  add column home_longitude numeric(9, 6),
  add column addon_skills text[] not null default '{}'::text[],
  add column service_skills text[] not null default '{}'::text[],
  add column alturas_certified boolean not null default false,
  add column alturas_certification_expires_on date,
  add column arl_risk_class integer,
  add column accepts_composite boolean not null default false,
  add column preferred_max_travel_minutes integer,
  add column operations_status text not null default 'active',
  add column termination_date date,
  add column termination_reason text,
  add constraint crm_team_members_home_latitude_check check (
    home_latitude is null or home_latitude between -90 and 90
  ),
  add constraint crm_team_members_home_longitude_check check (
    home_longitude is null or home_longitude between -180 and 180
  ),
  add constraint crm_team_members_arl_risk_class_check check (
    arl_risk_class is null or arl_risk_class between 1 and 5
  ),
  add constraint crm_team_members_preferred_max_travel_minutes_check check (
    preferred_max_travel_minutes is null or preferred_max_travel_minutes >= 0
  );

create index buildings_service_comuna_idx
  on public.buildings (service_id, comuna);

create index bookings_service_date_status_idx
  on public.bookings (service_id, scheduled_start, status);

create index bookings_service_client_date_idx
  on public.bookings (service_id, client_id, scheduled_start desc)
  where client_id is not null;

create index bookings_service_comuna_date_idx
  on public.bookings (service_id, comuna, scheduled_start)
  where comuna is not null;

create index bookings_service_building_idx
  on public.bookings (service_id, building_id)
  where building_id is not null;

create index booking_crew_booking_idx
  on public.booking_crew (service_id, booking_id);

create index booking_crew_cleaner_date_idx
  on public.booking_crew (
    service_id,
    cleaner_id,
    scheduled_start,
    scheduled_end
  );

create unique index booking_crew_one_lead_idx
  on public.booking_crew (service_id, booking_id)
  where is_lead;

create index booking_addons_booking_idx
  on public.booking_addons (service_id, booking_id);

create index booking_events_booking_created_idx
  on public.booking_events (service_id, booking_id, created_at);

create index cleaner_availability_cleaner_date_idx
  on public.cleaner_availability (
    service_id,
    cleaner_id,
    operational_date,
    window_start,
    window_end
  );

create index crm_team_members_home_comuna_idx
  on public.crm_team_members (service_id, home_comuna)
  where home_comuna is not null;

drop trigger if exists set_buildings_updated_at on public.buildings;
create trigger set_buildings_updated_at
before update on public.buildings
for each row execute function public.set_updated_at();

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

drop trigger if exists set_booking_crew_updated_at on public.booking_crew;
create trigger set_booking_crew_updated_at
before update on public.booking_crew
for each row execute function public.set_updated_at();

drop trigger if exists set_booking_addons_updated_at on public.booking_addons;
create trigger set_booking_addons_updated_at
before update on public.booking_addons
for each row execute function public.set_updated_at();

drop trigger if exists set_cleaner_availability_updated_at on public.cleaner_availability;
create trigger set_cleaner_availability_updated_at
before update on public.cleaner_availability
for each row execute function public.set_updated_at();

alter table public.buildings enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_crew enable row level security;
alter table public.booking_addons enable row level security;
alter table public.booking_events enable row level security;
alter table public.cleaner_availability enable row level security;

create policy "CRM admins manage buildings"
on public.buildings for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy "CRM admins manage bookings"
on public.bookings for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy "CRM admins manage booking crew"
on public.booking_crew for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy "CRM admins manage booking addons"
on public.booking_addons for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy "CRM admins manage booking events"
on public.booking_events for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy "CRM admins manage cleaner availability"
on public.cleaner_availability for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

revoke all on table
  public.buildings,
  public.bookings,
  public.booking_crew,
  public.booking_addons,
  public.booking_events,
  public.cleaner_availability
from public, anon;

grant select, insert, update, delete on table
  public.buildings,
  public.bookings,
  public.booking_crew,
  public.booking_addons,
  public.booking_events,
  public.cleaner_availability
to authenticated;
