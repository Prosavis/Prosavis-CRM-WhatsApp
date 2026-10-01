-- La primera pasada contaba ecos de la Business App (sent_via=app) como entregas sin pricing.
-- Esos mensajes no entran en la factura Cloud API. El medidor los deja fuera.

create or replace function public.whatsapp_delivery_cost_month()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('month', timezone('America/Bogota', now())))::date as month_start,
      (date_trunc('month', timezone('America/Bogota', now())) + interval '1 month')::date as month_end,
      to_char(timezone('America/Bogota', now()), 'YYYY-MM') as month_key
  ),
  known as (
    select *
    from (
      values
        ('1035566289641219'::text, '312'::text, 1),
        ('1043086062223440'::text, '311'::text, 2)
    ) as t(phone_number_id, label, sort_order)
  ),
  delivered as (
    select
      l.phone_number_id,
      lower(trim(l.pricing_category)) as pricing_category,
      lower(trim(l.pricing_type)) as pricing_type
    from public.whatsapp_message_log l
    cross join bounds b
    where l.direction = 'outbound'
      and l.status in ('delivered', 'read')
      and l.phone_number_id is not null
      and coalesce(l.sent_via, '') <> 'app'
      and (l.created_at at time zone 'America/Bogota')::date >= b.month_start
      and (l.created_at at time zone 'America/Bogota')::date < b.month_end
  ),
  classified as (
    select
      phone_number_id,
      case
        when pricing_category is null or pricing_category = '' then 'unpriced'
        when coalesce(pricing_type, '') like '%free_entry%' then 'free_entry'
        when pricing_category = 'service' then 'service'
        when pricing_category = 'utility' then 'utility'
        when pricing_category in ('authentication', 'authentication_international') then 'authentication'
        when pricing_category = 'marketing' then 'marketing'
        else 'other'
      end as bucket
    from delivered
  ),
  agg as (
    select
      phone_number_id,
      count(*) filter (where bucket = 'service')::int as service_delivered,
      count(*) filter (where bucket = 'utility')::int as utility_delivered,
      count(*) filter (where bucket = 'authentication')::int as authentication_delivered,
      count(*) filter (where bucket = 'marketing')::int as marketing_delivered,
      count(*) filter (where bucket = 'free_entry')::int as free_entry_point,
      count(*) filter (where bucket = 'other')::int as other_delivered,
      count(*) filter (where bucket = 'unpriced')::int as unpriced_delivered
    from classified
    group by phone_number_id
  ),
  lines as (
    select
      k.phone_number_id,
      k.label,
      k.sort_order,
      coalesce(a.service_delivered, 0) as service_delivered,
      least(coalesce(a.service_delivered, 0), 1000) as service_within_quota,
      greatest(coalesce(a.service_delivered, 0) - 1000, 0) as service_above_quota,
      coalesce(a.utility_delivered, 0) as utility_delivered,
      coalesce(a.authentication_delivered, 0) as authentication_delivered,
      coalesce(a.marketing_delivered, 0) as marketing_delivered,
      coalesce(a.free_entry_point, 0) as free_entry_point,
      coalesce(a.other_delivered, 0) as other_delivered,
      coalesce(a.unpriced_delivered, 0) as unpriced_delivered
    from known k
    left join agg a on a.phone_number_id = k.phone_number_id
    union all
    select
      a.phone_number_id,
      a.phone_number_id,
      9,
      a.service_delivered,
      least(a.service_delivered, 1000),
      greatest(a.service_delivered - 1000, 0),
      a.utility_delivered,
      a.authentication_delivered,
      a.marketing_delivered,
      a.free_entry_point,
      a.other_delivered,
      a.unpriced_delivered
    from agg a
    where not exists (
      select 1 from known k where k.phone_number_id = a.phone_number_id
    )
  ),
  priced as (
    select
      *,
      (
        service_delivered
        + utility_delivered
        + authentication_delivered
        + marketing_delivered
        + free_entry_point
        + other_delivered
      ) as priced_delivered,
      round(
        (marketing_delivered * 46.0227)
        + (
          (utility_delivered + authentication_delivered + service_above_quota)
          * 2.9455
        ),
        4
      ) as estimate_cop
    from lines
  ),
  totals as (
    select
      coalesce(sum(priced_delivered), 0)::int as priced_delivered,
      coalesce(sum(unpriced_delivered), 0)::int as unpriced_delivered,
      coalesce(sum(estimate_cop), 0) as estimate_cop
    from priced
  )
  select jsonb_build_object(
    'month', (select month_key from bounds),
    'timezone', 'America/Bogota',
    'currency', 'COP',
    'estimateLabel', 'estimado',
    'freeServiceQuota', 1000,
    'marketingRateCop', 46.0227,
    'utilityRateCop', 2.9455,
    'incomplete', (select priced_delivered = 0 or unpriced_delivered > 0 from totals),
    'pricedDelivered', (select priced_delivered from totals),
    'unpricedDelivered', (select unpriced_delivered from totals),
    'estimateCop', (
      select case
        when priced_delivered = 0 then null
        else estimate_cop
      end
      from totals
    ),
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'phoneNumberId', p.phone_number_id,
          'label', p.label,
          'serviceDelivered', p.service_delivered,
          'serviceWithinQuota', p.service_within_quota,
          'serviceAboveQuota', p.service_above_quota,
          'utilityDelivered', p.utility_delivered,
          'authenticationDelivered', p.authentication_delivered,
          'marketingDelivered', p.marketing_delivered,
          'freeEntryPoint', p.free_entry_point,
          'otherDelivered', p.other_delivered,
          'unpricedDelivered', p.unpriced_delivered,
          'estimateCop', case
            when p.priced_delivered = 0 then null
            else p.estimate_cop
          end
        )
        order by p.sort_order, p.phone_number_id
      )
      from priced p
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.whatsapp_delivery_cost_month() from public, anon, authenticated;
grant execute on function public.whatsapp_delivery_cost_month() to service_role;

comment on function public.whatsapp_delivery_cost_month() is
  'Estimado COP del mes en curso (America/Bogota) por phone_number_id. No es la factura de Meta. No bloquea envios. sent_via=app (Business App) queda fuera.';
