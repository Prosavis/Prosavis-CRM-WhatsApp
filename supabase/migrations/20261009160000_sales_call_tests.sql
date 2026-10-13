-- Banco de pruebas de las llamadas IA. El navegador no lee estas tablas.
-- Solo el service role del backend escribe y lee. RLS queda activo y sin políticas.

create table if not exists public.sales_call_tests (
  conversation_id text primary key,
  tester text,
  escenario_id text,
  modo text,
  origen text not null default 'vivo',
  guion_version text not null,
  voice_id text,
  speed numeric,
  stability numeric,
  empresa text,
  municipio text,
  variante_precio text,
  duracion_seg integer,
  transcript jsonb,
  analysis jsonb not null default '{}'::jsonb,
  evaluation jsonb not null default '{}'::jsonb,
  voz_1a5 smallint,
  comprension_1a5 smallint,
  respuesta_correcta boolean,
  fuera_de_lista boolean,
  frase_fuera_de_lista text,
  latencia_o_encima boolean,
  frases_mal_entendidas jsonb not null default '[]'::jsonb,
  notas text,
  calificada_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sales_call_tests_modo_chk check (
    modo is null or modo in ('saliente', 'entrante')
  ),
  constraint sales_call_tests_origen_chk check (origen in ('vivo', 'simulacion')),
  constraint sales_call_tests_voz_chk check (voz_1a5 is null or voz_1a5 between 1 and 5),
  constraint sales_call_tests_comprension_chk check (
    comprension_1a5 is null or comprension_1a5 between 1 and 5
  ),
  constraint sales_call_tests_frase_chk check (
    fuera_de_lista is not true
    or length(btrim(coalesce(frase_fuera_de_lista, ''))) > 0
  )
);

create index if not exists sales_call_tests_version_idx
  on public.sales_call_tests (guion_version, created_at desc);

create table if not exists public.sales_call_test_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  tool_name text not null,
  parameters jsonb not null default '{}'::jsonb,
  result jsonb,
  would_write jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_call_test_events_conversation_idx
  on public.sales_call_test_events (conversation_id, created_at);

alter table public.sales_call_tests enable row level security;
alter table public.sales_call_test_events enable row level security;

revoke all on table public.sales_call_tests from anon, authenticated;
revoke all on table public.sales_call_test_events from anon, authenticated;
