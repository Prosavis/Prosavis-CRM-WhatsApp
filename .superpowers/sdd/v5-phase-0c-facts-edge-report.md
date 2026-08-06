# V5 Fase 0C — Facts y Edge API

## Estado

Implementación local completada, sin deploy:

- `f652270`: facts financieros/capacidad y pgTAP.
- `d157207`: `ops-metrics` y `pago-verificado`.

## Facts

- `booking_facts`, `cleaner_day_facts`, `daily_ops_rollup`.
- Facturado por fecha de servicio; cobrado por timestamp efectivo del pago.
- Vencido solo `COMPLETED` impago; por vencer solo futuro `CONFIRMED`.
- `no_pudo_ingresar` consume capacidad y queda sin facturar.
- Márgenes caja, contribución antes/después de CAC y costo laboral.
- Triggers incrementales y `reconcile_ops_facts` para siete días.
- RLS admin-only y escrituras `service_role`.

`wompi_fee_cop` queda en cero mientras el valor contractual siga
`__CONFIRMAR__`; esto bloquea activación productiva del margen completo, no la
construcción.

## Edge

- `ops-metrics`: auth dual, CORS estricto, rango máximo 366 días, periodo
  comparativo de igual longitud y payload único para cards/margen/capacidad.
- `pago-verificado`: fallback manual full-payment, QR/CASH, idempotency key y
  auditoría en Firestore; el trigger existente proyecta el cambio.

## Verificación

- pgTAP cubre tablas, RLS, cobrado/facturado, cartera, contribución, 8h+T6,
  hueco de 2h, no-ingreso y rollup.
- Se intentó `supabase db reset --local`: bloqueado por
  `LegacyDbBootstrapError` (Docker/PostgreSQL local ausente).
- Deno no está instalado en el PATH actual; las pruebas Deno quedaron creadas
  pero no ejecutables en esta sesión.
- Prettier enfocado y `git diff --check`: exit `0`.
