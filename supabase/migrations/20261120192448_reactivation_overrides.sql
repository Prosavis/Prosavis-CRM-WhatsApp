-- Reactivación 312, ajustes del 20/11/2026 14:20.
-- Overrides por cliente, lead_7d, teléfonos, textos y guardia.
-- Solo service_role.

create table if not exists public.reactivation_message_overrides (
  phone_key text primary key,
  template_name text,
  var1 text,
  var2 text,
  exclude boolean not null default false,
  hold_reason text,
  handler text,
  note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint reactivation_message_overrides_template_check check (
    template_name is null
    or template_name in (
      'react_cliente_recuperar_v1',
      'react_lead_botones_v1',
      'disculpa_demora_respuesta_v1',
      'reactivacion_precios_kit_v1',
      'react_cliente_mensaje_personalizado',
      'react_cliente_antigua_fecha',
      'react_followup_semanas_sin_contacto',
      'react_followup_sin_respuesta_v2',
      'outreach_respuesta_si_quiere_precios',
      'rebooking_frecuencia',
      'seguimiento_cotizacion'
    )
  ),
  constraint reactivation_message_overrides_handler_check check (
    handler is null or handler in ('francy', 'nicolas')
  )
);

comment on table public.reactivation_message_overrides is
  'Texto o exclusión de una persona en la reactivación 312. No envía.';

revoke all on table public.reactivation_message_overrides from public, anon, authenticated;
grant select, insert, update, delete on table public.reactivation_message_overrides to service_role;

alter table public.crm_directory
  add column if not exists reactivation_hold_reason text;

comment on column public.crm_directory.reactivation_hold_reason is
  'Si tiene texto, la persona no entra a campañas de reactivación. No es un opt-out de PARAR.';

alter table public.whatsapp_broadcast_recipients
  add column if not exists template_name text,
  add column if not exists variables jsonb not null default '[]'::jsonb,
  add column if not exists context text;

create or replace function public.reactivation_candidates(
  p_segments text[] default null,
  p_priority text default null,
  p_eligible_only boolean default true,
  p_limit integer default 200,
  p_offset integer default 0,
  p_phone_key text default null
)
returns table (
  phone_key text,
  dial_phone text,
  display_name text,
  segment text,
  priority text,
  angle text,
  template_name text,
  var1 text,
  var2 text,
  context text,
  eligible boolean,
  due boolean,
  sensitive boolean,
  handler text,
  exclusion text,
  done_count integer,
  ltv_cop bigint,
  cadence_days integer,
  next_due date,
  last_done date,
  last_312 date,
  last_311 date,
  unanswered integer,
  opt_out boolean,
  phone_needs_review boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
with ov as (
  select *
  from (values
    ('4647356495', '34647356495', null::text, null::text, null::text, null::text, null::text, false, false),
    ('3005068598', null, null, null, null, null, null, true, false),
    ('3176715080', null, 'fuera_zona', null, null, null, null, false, false),
    ('3148315051', null, 'tercero', null, null, null, null, false, false),
    ('3154173499', null, 'empleada_interna', null, null, null, null, false, false),
    ('3116216979', null, 'ya_tiene', null, null, null, null, false, false),
    ('3206440646', null, 'sismo', null, null, null, null, false, false),
    ('3124414299', null, 'no_entregable', null, null, null, null, false, false),
    ('3239599990', null, 'no_entregable', null, null, null, null, false, false),
    ('3122324533', null, 'cobertura_pendiente', null, null, null, null, false, false),
    ('3137185066', null, 'cobertura_pendiente', null, null, null, null, false, false),
    ('3218814042', null, 'ya_soluciono', null, null, null, null, false, false),
    ('3106326364', null, 'desistio', null, null, null, null, false, false),
    ('3174223552', null, 'ajeno', null, null, null, null, false, false),
    ('3108826425', null, 'ajeno', null, null, null, null, false, false),
    ('3116113130', null, 'ajeno', null, null, null, null, false, false),
    ('3185657242', null, 'ajeno', null, null, null, null, false, false),
    ('3243155286', null, 'federico', null, null, null, null, false, false),
    ('3153216660', null, null, 'react_cliente_recuperar_v1', 'tomamos nota de lo que pasó en tu última visita y queremos compensarte con un mejor servicio.', 'P1', 'nicolas', false, true),
    ('3207477004', null, 'empleo', null, null, null, null, false, false),
    ('3217866577', null, null, 'react_cliente_recuperar_v1', 'tomamos nota de tus observaciones de la última visita y quedan anotadas para la próxima.', 'P1', null, false, true),
    ('3216102729', null, null, 'react_cliente_recuperar_v1', 'quedó pendiente confirmar la garantía del baño y retomar la limpieza de la oficina.', 'P1', null, false, true),
    ('3234290949', null, null, 'react_cliente_mensaje_personalizado', '¿Ya estás de regreso en la ciudad? Si quieres, retomamos tus limpiezas.', null, null, false, false),
    ('3161783197', null, null, 'react_cliente_mensaje_personalizado', 'Nos preguntaste por una limpieza de desalojo; si todavía la necesitas, te ayudamos a cotizarla.', null, null, false, false),
    ('3150729571', null, null, 'react_cliente_mensaje_personalizado', 'Quedó pendiente buscar otra fecha; revisamos cupos para la próxima semana.', null, null, false, false),
    ('3219018699', null, null, 'react_cliente_recuperar_v1', 'La visita anterior no se pudo cumplir. Cuéntanos cómo quieres que la retomemos.', 'P1', 'nicolas', false, true),
    ('3153545049', null, null, 'react_cliente_recuperar_v1', 'en la visita anterior faltó el agua y queremos que la próxima salga completa.', 'P1', 'nicolas', false, true),
    ('3023185094', null, null, 'react_cliente_mensaje_personalizado', '¿Ya regresaste de tu viaje?', null, null, false, false),
    ('3145574107', null, null, 'react_cliente_mensaje_personalizado', '¿Ya regresaste de tu viaje?', null, null, false, false),
    ('3011891981', null, null, 'react_cliente_mensaje_personalizado', 'Te ayudamos a elegir la jornada que se ajuste a tu presupuesto.', null, null, false, false),
    ('3183964660', null, null, 'seguimiento_cotizacion', 'la limpieza semanal de 8 horas', 'P3', null, false, false),
    ('3147908891', null, null, null, null, 'P3', null, false, false),
    ('3148960541', null, null, 'react_cliente_mensaje_personalizado', 'Queremos retomar tu limpieza y dejar claro el transporte antes de agendar.', null, null, false, true),
    ('3154289072', null, null, 'react_cliente_recuperar_v1', 'Antes de proponerte otra visita queremos saber cómo sigues.', 'P1', 'nicolas', false, true),
    ('3105278797', null, null, 'react_cliente_recuperar_v1', 'quedó pendiente la limpieza después del hollín y queremos retomarla contigo.', 'P1', 'francy', false, true),
    ('3001345428', null, null, null, null, null, 'francy', false, true),
    ('3146267339', null, null, null, null, null, 'francy', false, true),
    ('3108665617', null, null, null, null, null, 'francy', false, true)
  ) as t(k, dial, force_excl, template, var2, priority, handler, include, sensitive)
),
m as (
  select
    split_part(conversation_stable_key, '__', 1) as sk0,
    coalesce(phone_number_id, '1035566289641219') as pn,
    direction,
    created_at,
    template_name,
    coalesce(nullif(message_body, ''), voice_transcription, caption, '') as body
  from public.whatsapp_message_log
  where crm_deleted_at is null
    and conversation_stable_key is not null
),
m2 as (
  select
    m.*,
    max(created_at) filter (where direction = 'inbound') over (partition by sk0, pn) as li
  from m
),
lg as (
  select
    sk0,
    pn,
    max(li) as last_in,
    count(*) filter (where direction = 'inbound')::integer as n_in,
    count(*) filter (
      where direction = 'outbound'
        and template_name ~ '^(react_|seguimiento_|outreach_|promo_general|rebooking|welcome_greeting|lunes_prosavis|disculpa_|reactivacion_)'
        and (li is null or created_at > li)
        and created_at >= '2026-06-01'
    )::integer as rsr,
    max(created_at) filter (
      where direction = 'outbound'
        and template_name ~ '^(react_|seguimiento_|outreach_|promo_general|rebooking|welcome_greeting|lunes_prosavis|disculpa_|reactivacion_)'
    ) as lr,
    (array_agg(direction order by created_at desc))[1] as ldir,
    (array_agg(body order by created_at desc) filter (where direction = 'inbound' and body <> ''))[1] as ltxt,
    bool_or(
      direction = 'inbound'
      and body ~* '(no me interesa|no estoy interesad|por el momento no|ya tenemos quien|ya tengo quien|no necesito el servicio|no gracias)'
    ) as dno,
    bool_or(
      direction = 'inbound'
      and body ~* '(busco (empleo|trabajo)|hoja de vida|vacante|trabajar con ustedes|postular)'
    ) as djob
  from m2
  group by sk0, pn
),
cv as (
  select
    lg.*,
    case
      when lg.sk0 like 'lid%' then lg.sk0
      else right(regexp_replace(lg.sk0, '\D', '', 'g'), 10)
    end as k,
    lg.sk0 as rawk,
    (
      select array_agg(t.name)
      from public.whatsapp_chat_tags t
      where t.id = any(c.tag_ids)
    ) as ctags,
    c.intake_intent_label as intake,
    c.loss_reason,
    coalesce(nullif(c.contact_name, ''), c.whatsapp_profile_name) as cname
  from lg
  left join public.whatsapp_conversations c
    on split_part(c.stable_key, '__', 1) = lg.sk0
   and c.phone_number_id = lg.pn
),
p312 as (
  select distinct on (k) *
  from cv
  where pn = '1035566289641219'
  order by k, last_in desc nulls last
),
p311 as (
  select distinct on (k) *
  from cv
  where pn = '1043086062223440'
  order by k, last_in desc nulls last
),
bk_raw as (
  select
    right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 10) as bkk,
    status,
    scheduled_start,
    client_phone,
    client_name,
    cancellation_reason,
    coalesce(paid_cop, total_cop, 0) as money_cop
  from public.bookings
  where source_deleted_at is null
    and coalesce(client_phone, '') <> ''
    and (service_id is null or service_id = 'nwEMgpEqVwY3o95u3PNE')
),
bk as (
  select
    bkk,
    count(*) filter (where status = 'COMPLETED')::integer as done,
    count(*) filter (where status = 'CANCELED')::integer as canc,
    count(*) filter (
      where status in ('CONFIRMED', 'IN_PROGRESS')
        and scheduled_start >= now()
    )::integer as fut,
    max(scheduled_start) filter (where status = 'COMPLETED') as last_done_at,
    max(scheduled_start) filter (where status = 'CANCELED') as last_canc_at,
    coalesce(sum(money_cop) filter (where status = 'COMPLETED'), 0)::bigint as ltv,
    (array_agg(client_phone order by scheduled_start desc) filter (where client_phone is not null))[1] as sample_phone,
    (array_agg(client_name order by scheduled_start desc) filter (where status = 'COMPLETED' and client_name is not null))[1] as sample_name
  from bk_raw
  where bkk <> ''
  group by bkk
),
gaps as (
  select
    bkk,
    percentile_cont(0.5) within group (order by gap_days) as cadence
  from (
    select
      bkk,
      extract(epoch from (scheduled_start - lag(scheduled_start) over (partition by bkk order by scheduled_start))) / 86400.0 as gap_days
    from bk_raw
    where status = 'COMPLETED'
      and scheduled_start is not null
  ) g
  where gap_days is not null
    and gap_days between 7 and 120
  group by bkk
  having count(*) >= 2
),
keys as (
  select bkk as k from bk
  union
  select k from p312 where n_in > 0
  union
  select k from p311 where n_in > 0
),
base as (
  select
    keys.k,
    coalesce(a.rawk, f.rawk) as rawk,
    a.last_in as a_in,
    a.ldir as a_dir,
    coalesce(a.n_in, 0) as a_n,
    coalesce(a.rsr, 0) as a_rsr,
    a.lr as a_lr,
    coalesce(a.dno, false) as a_no,
    coalesce(a.djob, false) as a_job,
    a.ctags as a_tags,
    a.intake as a_intake,
    a.loss_reason as a_loss,
    a.ltxt as a_txt,
    a.cname as a_name,
    f.last_in as f_in,
    coalesce(f.n_in, 0) as f_n,
    coalesce(f.dno, false) as f_no,
    f.ltxt as f_txt,
    f.cname as f_name,
    coalesce(bk.done, 0) as done,
    coalesce(bk.canc, 0) as canc,
    coalesce(bk.fut, 0) as fut,
    bk.last_done_at,
    bk.last_canc_at,
    coalesce(bk.ltv, 0) as ltv,
    bk.sample_phone,
    bk.sample_name,
    gaps.cadence,
    d.opt_out,
    d.tags as dtags,
    d.reactivation_hold_reason as hold,
    coalesce(nullif(d.display_name, ''), d.full_name) as dname,
    d.internal_notes_summary as cajon,
    w.tipo_contacto as wt,
    w.ficha -> 'ciudad' ->> 'valor' as wcity,
    w.ficha -> 'nombre' ->> 'valor' as wname,
    w.resultado,
    r.etapa,
    (bl.k is not null) as blocked,
    (tm.k is not null) as team,
    (jc.k is not null) as job
  from keys
  left join p312 a on a.k = keys.k
  left join p311 f on f.k = keys.k
  left join bk on bk.bkk = keys.k
  left join gaps on gaps.bkk = keys.k
  left join lateral (
    select opt_out, tags, display_name, full_name, internal_notes_summary, reactivation_hold_reason
    from public.crm_directory cd
    where cd.phone_key = keys.k
    order by cd.updated_at desc
    limit 1
  ) d on true
  left join public.whatsapp_client_cards w on w.phone = '57' || keys.k
  left join lateral (
    select etapa
    from public.whatsapp_study_chat_reviews rr
    where rr.phone = '57' || keys.k
    order by (rr.stable_key like '%\_\_%')
    limit 1
  ) r on true
  left join (
    select distinct right(regexp_replace(phone, '\D', '', 'g'), 10) as k
    from public.whatsapp_blocklist
    where phone is not null
  ) bl on bl.k = keys.k
  left join (
    select distinct right(regexp_replace(phone_number, '\D', '', 'g'), 10) as k
    from public.crm_team_members
    where phone_number is not null
  ) tm on tm.k = keys.k
  left join (
    select distinct coalesce(phone_key, right(regexp_replace(phone, '\D', '', 'g'), 10)) as k
    from public.job_candidates
    where deleted_at is null
  ) jc on jc.k = keys.k
),
named as (
  select
    b.*,
    coalesce(b.a_tags, '{}') || coalesce(b.dtags, '{}') as at2,
    coalesce(b.dname, b.wname, b.sample_name, b.a_name, b.f_name, '') as nm,
    coalesce(b.resultado, '') as rs,
    (b.last_done_at at time zone 'America/Bogota')::date as last_done,
    (b.last_canc_at at time zone 'America/Bogota')::date as last_canc,
    (timezone('America/Bogota', now()))::date as hoy,
    case
      when b.cadence is null then null
      else round(b.cadence)::integer
    end as cadence_days
  from base b
),
timed as (
  select
    n.*,
    case when n.last_done is null then null else (n.hoy - n.last_done) end as days_done,
    case when n.last_canc is null then null else (n.hoy - n.last_canc) end as days_canc,
    case
      when n.cadence_days is null or n.last_done is null then null
      else n.last_done + make_interval(days => greatest(n.cadence_days, 14))
    end::date as next_due,
    (
      n.a_txt is not null
      and (
        length(regexp_replace(lower(n.a_txt), '[^a-záéíóúñ]', '', 'g')) < 3
        or lower(n.a_txt) ~ '^\W*(ok|okay|vale|gracias|muchas gracias|mil gracias|listo|perfecto|dale|bueno|de acuerdo|claro|igualmente)\W*$'
      )
    ) as ack
  from named n
),
ruled as (
  select
    t.*,
    (
      t.done >= 2
      and t.cadence_days between 7 and 60
      and t.days_done between greatest(t.cadence_days - 7, 14) and t.cadence_days + 21
    ) as in_rhythm,
    case
      when coalesce(t.nm, '') ~* '(sara bernal|naila|camila salgado|yaneth cristina|ana sof[ií]a mej[ií]a|ricardo tob[oó]n|enlazando almas|inclearning|consuelo|augusto|amparo jaramillo|federico)'
        then 'lista_negra'
      when coalesce(t.opt_out, false) or t.blocked or t.at2 && array['Parar', 'Bloqueado', 'Decline', '🚫']
        then 'opt_out'
      when t.fut > 0 then 'cita_futura'
      when t.at2 && array['Cliente Problemática', 'undeliverable Meta', 'failed to be sent']
        then 'no_entregable'
      when (t.team or t.wt in ('auxiliar', 'equipo', 'proveedor') or t.at2 && array['Auxiliares', 'TEST', 'Equipo Prosavis'] or t.nm ~* '\mtest\M')
        and t.k <> '3005068598'
        then 'equipo'
      when t.done = 0 and (
        t.job or t.a_job or t.a_intake = 'empleo' or t.at2 && array['Job', 'Entrevista', 'Trabajo'] or t.a_loss = 'buscaba_empleo'
        or t.rs ~* '(empleo|hoja de vida|vacante|postul|candidat|aspirante|trabajar en|selecci[oó]n)'
      ) then 'empleo'
      when t.a_no or t.f_no or t.rs ~* '(parar|no recibir|no (le )?interesa|rechaz|no requiere|no necesita|consigui[oó] a otra|ya tiene|ya solucion)'
        then 'dijo_no'
      when t.a_loss = 'fuera_de_cobertura'
        or (t.wcity is not null and t.wcity !~* '(pereira|dosquebradas|santa rosa|cerritos)')
        or t.at2 && array['Armenia', 'Manizales', 'Cali', 'Chinchiná', 'Anserma', 'Viterbo', 'Cajicá', 'Bogotá']
        or t.rs ~* '(cobertura|fuera de zona|bogot[aá]|cali\M|armenia|ginebra|cartago|manizales|medell[ií]n|la virginia|chinchin[aá]|santag[uü]eda)'
        then 'fuera_zona'
      when t.rs ~* '(proveedor|ofrece (sus )?servicios|vende|publicidad|spam|respuesta autom[aá]tica|transporte y fletes)'
        then 'proveedor'
      when greatest(t.a_in, t.f_in) > now() - interval '48 hours' then '48h'
      when t.a_lr > now() - interval '7 days' then 'react_7d'
      when t.a_rsr >= 2 then '2_sin_resp'
      when nullif(t.hold, '') is not null then 'hold'
      else null
    end as excl
  from timed t
),
seg as (
  select
    r.*,
    case
      when r.in_rhythm then 'R'
      when r.done >= 2 and r.days_done >= 21 then 'VIP'
      when r.done = 1 and r.days_done >= 21 then 'C1'
      when r.done = 0 and r.canc >= 1 and coalesce(r.days_canc, 0) >= 21 then 'X'
      when r.done = 0 and (r.wt = 'empresa' or r.at2 && array['Empresas']) then
        case
          when r.a_n >= 2 and r.etapa in ('datos', 'propuesta', 'cierre') then 'E1'
          else 'E2'
        end
      when r.done = 0 and r.a_n > 0 and r.a_dir = 'inbound' and not r.ack then
        case when r.a_in >= '2026-09-01 05:00+00' then 'B' else 'Bh' end
      when r.done = 0 and r.a_n > 0 and r.a_in >= '2026-09-01 05:00+00' then 'L'
      when r.done = 0 and r.a_n > 0 then 'H'
      when r.done = 0 and r.f_n > 0 then 'F'
      when r.done > 0 then 'activo'
      else 'otro'
    end as segment,
    case
      when r.rs ~* '(solidari|terremoto|sismo|temblor|institucional|apoyo|difusi[oó]n)'
        and r.rs !~* '(precio|tarifa|cotiz|agend|servicio de limpieza|limpieza)'
        then 'difusion'
      when r.rs ~* '(precio|tarifa|costo|cotiz)' then 'precio'
      when r.rs ~* '(avis|m[aá]s adelante|futuro|luego|pr[oó]xim)' then 'avisar'
      when r.rs ~* '(habitaci|apartamento|apto|casa|direcci|barrio|m2|metros|baño)' then 'datos'
      when r.rs ~* '(agend|reserv|fecha|disponib)' then 'agendar'
      when r.rs ~* '(informaci[oó]n inicial|solicita informaci|quiero m[aá]s informaci|pidi[oó] informaci)' or r.rs = ''
        then 'info'
      else 'otro'
    end as angle
  from ruled r
),
picked as (
  select
    s.*,
    coalesce(s.a_in, s.f_in) as last_touch,
    split_part(trim(regexp_replace(s.nm, '[^A-Za-zÁÉÍÓÚáéíóúÑñÜü ]', ' ', 'g')), ' ', 1) as g0,
    s.excl as excl2,
    ov.dial as ov_dial,
    ov.force_excl,
    ov.template as ov_template,
    ov.var2 as ov_var2,
    ov.priority as ov_priority,
    ov.handler as ov_handler,
    coalesce(ov.sensitive, false) as ov_sensitive,
    mo.template_name as mo_template,
    mo.var1 as mo_var1,
    mo.var2 as mo_var2,
    coalesce(mo.exclude, false) as mo_exclude,
    mo.hold_reason as mo_hold,
    mo.handler as mo_handler
  from seg s
  left join ov on ov.k = s.k
  left join public.reactivation_message_overrides mo on mo.phone_key = s.k
),
final as (
  select
    p.k as phone_key,
    case
      when p.ov_dial is not null then p.ov_dial
      when regexp_replace(coalesce(p.sample_phone, ''), '\D', '', 'g') ~ '^[0-9]{11,15}$'
        and left(regexp_replace(p.sample_phone, '\D', '', 'g'), 2) <> '57'
        then regexp_replace(p.sample_phone, '\D', '', 'g')
      when regexp_replace(coalesce(p.rawk, ''), '\D', '', 'g') ~ '^57[0-9]{10}$'
        then regexp_replace(p.rawk, '\D', '', 'g')
      when p.k ~ '^[0-9]{10}$' then '57' || p.k
      else null
    end as dial_phone,
    left(regexp_replace(p.nm, '[[:space:]]+', ' ', 'g'), 80) as display_name,
    p.segment,
    case
      when p.ov_priority is not null then p.ov_priority
      when p.segment = 'VIP' then 'P1'
      when p.segment = 'C1' and coalesce(p.days_done, 0) >= 45 then 'P1'
      when p.segment = 'C1' then 'P2'
      when p.segment = 'X' and coalesce(p.days_canc, 0) <= 90 then 'P1'
      when p.segment = 'X' then 'P2'
      when p.segment = 'B' and p.a_in >= '2026-10-15 05:00+00' then 'P1'
      when p.segment = 'B' then 'P2'
      when p.segment = 'L' and p.angle in ('agendar', 'avisar', 'datos', 'precio') then 'P2'
      when p.segment = 'L' then 'P3'
      when p.segment = 'H' then 'P4'
      when p.segment = 'R' then 'fecha'
      else 'P3'
    end as priority,
    p.angle,
    case
      when p.mo_template is not null then p.mo_template
      when p.ov_template is not null then p.ov_template
      when p.segment = 'R' then 'rebooking_frecuencia'
      when p.segment = 'B' then 'disculpa_demora_respuesta_v1'
      when p.segment = 'C1'
        and right(p.k, 1) in ('0', '2', '4', '6', '8')
        then 'react_cliente_antigua_fecha'
      when p.segment in ('VIP', 'C1', 'X') then 'react_cliente_mensaje_personalizado'
      when p.segment in ('L', 'H') and p.angle = 'precio' then 'reactivacion_precios_kit_v1'
      when p.segment in ('L', 'H') and p.angle in ('info', 'otro')
        and right(p.k, 1) in ('1', '3', '5', '7', '9')
        then 'react_lead_botones_v1'
      when p.segment = 'L' and p.angle = 'info' then 'outreach_respuesta_si_quiere_precios'
      when p.segment = 'L' and p.angle = 'otro' then 'react_followup_sin_respuesta_v2'
      when p.segment in ('L', 'H') and p.angle in ('agendar', 'avisar', 'datos') then 'react_cliente_mensaje_personalizado'
      else 'react_followup_semanas_sin_contacto'
    end as template_name,
    case
      when p.mo_var1 is not null then left(p.mo_var1, 40)
      when lower(regexp_replace(p.nm, '[^a-záéíóúñ]', '', 'g')) = 'lilianapatriciamoreno' then 'Liliana'
      when length(p.g0) < 3
        or p.nm ~* '(s\s*\.?\s*a\s*\.?\s*s|ltda|inmobiliaria|restaurante|hotel|log[ií]stica|empresa|conjunto|edificio|mudanza|finca|proyecto|telecom|spa|óptica|optica|co\s*working|hospitality|export|consultor[ií]a|ingenier[ií]a)'
        or p.nm ~ '@'
        or (
          split_part(trim(regexp_replace(p.nm, '[^A-Za-zÁÉÍÓÚáéíóúÑñÜü ]', ' ', 'g')), ' ', 2) = ''
          and length(p.g0) > 12
        )
        then 'de nuevo'
      else initcap(lower(p.g0))
    end as var1,
    p.mo_var2,
    p.ov_var2,
    left(coalesce(nullif(p.cajon, ''), nullif(p.rs, ''), nullif(p.a_txt, ''), nullif(p.f_txt, ''), ''), 240) as context,
    coalesce(p.force_excl, p.excl2,
      case when p.mo_exclude then coalesce(nullif(p.mo_hold, ''), 'override') end,
      case
        when p.k like 'lid%' then 'lid'
        when p.angle = 'difusion' then 'difusion'
        when p.segment = 'E2' then 'empresa_frio'
        when p.segment in ('activo', 'otro') then 'reciente'
        when p.segment in ('L', 'H') and p.a_in > now() - interval '7 days' then 'lead_7d'
        else null
      end
    ) as exclusion,
    p.done as done_count,
    p.ltv as ltv_cop,
    p.cadence_days,
    p.next_due,
    p.last_done,
    (p.a_in at time zone 'America/Bogota')::date as last_312,
    (p.f_in at time zone 'America/Bogota')::date as last_311,
    p.a_rsr as unanswered,
    coalesce(p.opt_out, false) as opt_out,
    p.days_done,
    p.last_done as last_done_date,
    coalesce(p.ov_sensitive, false) or coalesce(p.mo_handler, p.ov_handler, '') in ('francy', 'nicolas') as sensitive,
    coalesce(p.mo_handler, p.ov_handler) as handler,
    p.segment as seg
  from picked p
)
select
  f.phone_key,
  f.dial_phone,
  f.display_name,
  f.segment,
  f.priority,
  f.angle,
  f.template_name,
  f.var1,
  coalesce(
    f.mo_var2,
    f.ov_var2,
    case f.template_name
      when 'react_cliente_antigua_fecha' then
        extract(day from f.last_done_date)::text || ' de ' ||
        (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from f.last_done_date)::int]
      when 'react_followup_semanas_sin_contacto' then 'unos meses'
      when 'reactivacion_precios_kit_v1' then null
      when 'outreach_respuesta_si_quiere_precios' then null
      when 'react_followup_sin_respuesta_v2' then null
      when 'rebooking_frecuencia' then null
      when 'disculpa_demora_respuesta_v1' then
        case f.angle
          when 'precio' then 'los precios de la limpieza'
          when 'agendar' then 'la fecha de tu limpieza'
          when 'datos' then 'los datos de tu espacio'
          when 'avisar' then 'el momento para agendar'
          else 'tu solicitud de limpieza'
        end
      when 'seguimiento_cotizacion' then 'la limpieza de tu espacio'
      when 'react_lead_botones_v1' then
        case
          when f.seg = 'H' then 'Hace unos meses hablamos sobre tu limpieza con Prosavis.'
          else 'Hace un tiempo nos escribiste por una limpieza.'
        end
      when 'react_cliente_mensaje_personalizado' then
        case
          when f.seg in ('VIP', 'C1', 'X') and f.angle in ('otro', 'info')
            then 'Hace un tiempo no hacemos tu limpieza y nos encantaría volver a ayudarte con tu hogar.'
          when f.seg = 'H' and f.angle = 'agendar'
            then 'Hace unos meses hablamos y quedó pendiente agendar tu limpieza.'
          when f.angle = 'agendar' then 'Quedó pendiente agendar tu próxima limpieza con nosotros.'
          when f.angle = 'avisar' then 'Quedaste de avisarnos cuándo querías retomar; seguimos atentos.'
          when f.angle = 'datos' then 'Quedó pendiente que nos compartieras la dirección y el horario para tu limpieza.'
          else 'Hace un tiempo no hacemos tu limpieza y nos encantaría volver a ayudarte con tu hogar.'
        end
      else 'tu limpieza'
    end
  ) as var2,
  f.context,
  (
    f.exclusion is null
    and f.segment in ('VIP', 'C1', 'R', 'X', 'B', 'Bh', 'L', 'H', 'F', 'E1')
  ) as eligible,
  case
    when f.segment = 'R' then f.next_due is not null and f.next_due <= (timezone('America/Bogota', now()))::date
    else true
  end as due,
  f.sensitive,
  f.handler,
  f.exclusion,
  f.done_count,
  f.ltv_cop,
  f.cadence_days,
  f.next_due,
  f.last_done,
  f.last_312,
  f.last_311,
  f.unanswered,
  f.opt_out,
  (
    f.dial_phone is null
    or (
      f.dial_phone !~ '^573[0-9]{9}$'
      and f.phone_key not in ('7186979854', '7723730443', '2397854065', '9198590981', '2035501869')
    )
  ) as phone_needs_review
from final f
where (p_segments is null or f.segment = any(p_segments))
  and (p_priority is null or f.priority = p_priority)
  and (not coalesce(p_eligible_only, true) or (
    f.exclusion is null
    and f.segment in ('VIP', 'C1', 'R', 'X', 'B', 'Bh', 'L', 'H', 'F', 'E1')
  ))
  and (p_phone_key is null or f.phone_key = p_phone_key)
order by
  case f.priority when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 when 'fecha' then 4 else 5 end,
  f.display_name
limit least(greatest(coalesce(p_limit, 200), 1), 20000)
offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.reactivation_candidates(text[], text, boolean, integer, integer, text) is
  'Candidatos de reactivación 312. No envía. service_role.';

revoke all on function public.reactivation_candidates(text[], text, boolean, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.reactivation_candidates(text[], text, boolean, integer, integer, text)
  to service_role;

create or replace function public.reactivation_candidate_counts()
returns table (
  segment text,
  priority text,
  eligible boolean,
  due boolean,
  n bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.segment, c.priority, c.eligible, c.due, count(*)::bigint
  from public.reactivation_candidates(null, null, false, 20000, 0, null) c
  group by c.segment, c.priority, c.eligible, c.due;
$fn$;

revoke all on function public.reactivation_candidate_counts() from public, anon, authenticated;
grant execute on function public.reactivation_candidate_counts() to service_role;

-- Revisión barata justo antes de enviar. No rearma el universo.
create or replace function public.reactivation_send_guard(p_phone_key text, p_dial text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $guard$
declare
  v_key text := right(regexp_replace(coalesce(nullif(p_phone_key, ''), p_dial, ''), '\D', '', 'g'), 10);
begin
  if v_key is null or length(v_key) < 10 then
    return 'telefono';
  end if;
  if exists (
    select 1
    from public.crm_directory d
    where d.phone_key = v_key
      and (
        coalesce(d.opt_out, false)
        or nullif(d.reactivation_hold_reason, '') is not null
        or coalesce(d.tags, '{}') && array['Parar', 'Bloqueado', 'Decline', '🚫']
      )
  ) then
    return 'opt_out';
  end if;
  if exists (
    select 1
    from public.whatsapp_blocklist b
    where right(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), 10) = v_key
  ) then
    return 'lista_negra';
  end if;
  if exists (
    select 1
    from public.crm_team_members tm
    where right(regexp_replace(coalesce(tm.phone_number, ''), '\D', '', 'g'), 10) = v_key
      and v_key <> '3005068598'
  ) then
    return 'equipo';
  end if;
  if exists (
    select 1
    from public.bookings bk
    where bk.source_deleted_at is null
      and right(regexp_replace(coalesce(bk.client_phone, ''), '\D', '', 'g'), 10) = v_key
      and bk.status in ('CONFIRMED', 'IN_PROGRESS')
      and bk.scheduled_start >= now()
  ) then
    return 'cita_futura';
  end if;
  if exists (
    select 1
    from public.reactivation_message_overrides o
    where o.phone_key = v_key
      and o.exclude
  ) then
    return 'override';
  end if;
  if exists (
    select 1
    from public.whatsapp_message_log m
    where m.crm_deleted_at is null
      and coalesce(m.phone_number_id, '1035566289641219') in ('1035566289641219', '1043086062223440')
      and right(regexp_replace(split_part(coalesce(m.conversation_stable_key, ''), '__', 1), '\D', '', 'g'), 10) = v_key
      and m.direction = 'inbound'
      and m.created_at > now() - interval '48 hours'
  ) then
    return '48h';
  end if;
  if exists (
    select 1
    from public.whatsapp_message_log m
    where m.crm_deleted_at is null
      and m.phone_number_id in ('1035566289641219', '1043086062223440')
      and right(regexp_replace(split_part(coalesce(m.conversation_stable_key, ''), '__', 1), '\D', '', 'g'), 10) = v_key
      and m.direction = 'outbound'
      and m.author_kind = 'persona'
      and m.created_at > now() - interval '72 hours'
  ) then
    return 'humano_72h';
  end if;
  if exists (
    select 1
    from public.whatsapp_message_log m
    where m.crm_deleted_at is null
      and coalesce(m.phone_number_id, '1035566289641219') = '1035566289641219'
      and right(regexp_replace(split_part(coalesce(m.conversation_stable_key, ''), '__', 1), '\D', '', 'g'), 10) = v_key
      and m.direction = 'outbound'
      and m.template_name ~ '^(react_|seguimiento_|outreach_|promo_general|rebooking|welcome_greeting|lunes_prosavis|disculpa_|reactivacion_)'
      and m.created_at > now() - interval '7 days'
  ) then
    return 'react_7d';
  end if;
  return null;
end;
$guard$;

revoke all on function public.reactivation_send_guard(text, text) from public, anon, authenticated;
grant execute on function public.reactivation_send_guard(text, text) to service_role;

-- «Ahora no» pausa a la persona aunque no tenga ficha en el directorio.
create or replace function public.reactivation_ahora_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $ahora$
declare
  v_key text;
begin
  if new.direction is distinct from 'inbound' then
    return new;
  end if;
  if coalesce(new.phone_number_id, '') <> '1035566289641219' then
    return new;
  end if;
  if lower(btrim(coalesce(new.message_body, ''))) <> 'ahora no' then
    return new;
  end if;
  v_key := right(regexp_replace(split_part(coalesce(new.conversation_stable_key, ''), '__', 1), '\D', '', 'g'), 10);
  if length(v_key) <> 10 then
    return new;
  end if;
  insert into public.reactivation_message_overrides (
    phone_key, exclude, hold_reason, note, updated_by, updated_at
  ) values (
    v_key,
    true,
    'ahora_no',
    'boton ' || to_char(timezone('America/Bogota', now()), 'YYYY-MM-DD'),
    'trigger',
    now()
  )
  on conflict (phone_key) do update
    set exclude = true,
        hold_reason = 'ahora_no',
        note = excluded.note,
        updated_by = 'trigger',
        updated_at = now();
  return new;
end;
$ahora$;

drop trigger if exists reactivation_ahora_no on public.whatsapp_message_log;
create trigger reactivation_ahora_no
  after insert on public.whatsapp_message_log
  for each row
  execute function public.reactivation_ahora_no();
