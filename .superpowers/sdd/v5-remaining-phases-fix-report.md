# V5 — Reporte de correcciones post-review (fases restantes)

## Status

DONE_WITH_CONCERNS

## Entrega

- Motor agenda: travel entra en factibilidad de ventanas; gaps exactos sin
  buffer se rechazan con `insufficient_window_including_travel`.
- Scoring: vectores productivos incompletos (rating/afinidad/ingreso) quedan
  visibles pero no recomendados (`incomplete_productivity_vector`, score null).
- API agenda: fechas calendario round-trip y COP enteros.
- Migración `20260806212903_ops_v5_review_fixes.sql`:
  - recovery ocupa `PENDING` / `PENDING_RESCHEDULE`;
  - `apply_ops_rating_event` rechaza conflictos de `source_event_id`;
  - `refresh_cleaner_monthly_payroll` exige snapshot del periodo/config y no
    reporta `applied=true` sin `payroll_id`;
  - FKs directory por `(service_id, directory_id)` cuando el esquema lo permite.
- Fixture pgTAP `ops_v5_jobs_ai.test.sql`: outcome `overridden` con
  `override_reason`.

## Checks

```powershell
npx deno test --allow-read supabase/functions/_shared/agenda/agendaEngine.test.ts supabase/functions/_shared/agenda/api.test.ts
```

Resultado: 13/13 PASS.

SQL runtime (`supabase test db --local`) sigue bloqueado sin Docker/Podman.

## Concerns

- Idempotencia concurrente Edge (`agenda-opciones` / `agenda-perdida` /
  `visitas-registrar`) queda documentada; no se reescribió toda la capa HTTP
  en este bloque.
- Schedulers de recovery 18:00 / cierre mensual viven fuera de CRM (Firebase
  o invocación `service_role`); no se inventó `cron.schedule` aquí.
- Sin deploy ni mutaciones remotas.
