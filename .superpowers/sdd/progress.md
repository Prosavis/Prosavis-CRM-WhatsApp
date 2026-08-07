# Inbox IA phases progress

- Preflight: complete; preserve all pre-existing uncommitted changes in both repos.
- Decisions: 7-day availability horizon; 4-hour fallback duration; secure HTTP bridge for appointment actions; tags use `patch-whatsapp-conversation`.
- Fase 1 pricing: complete (100 tests passed; type-check passed; task review Spec PASS / Quality APPROVED).
- Fase 1 payment and Meta window: complete (commits 874692b, 401a42f, 4ca60ab; 126 tests and type-check passed; task review Spec PASS / Quality APPROVED).
- Fase 2 operational context: complete (commits 65ec4d2, ebdbf3f; 136 tests and type-check passed; task review Spec PASS / Quality APPROVED).
- V5 Fase 0A foundation: complete (commits da117ca..2c24293, task review approved; pgTAP runtime pending Docker/Podman).
- V5 Fase 0A security: complete (commits 70546de..a2f8fcf, task review approved; 21/21 Deno tests, fmt and lint verified).
- V5 Fase 0A gate: executable checks complete; `supabase db reset --local` remains blocked because Docker/Podman is unavailable.
- V5 Fase 0B projection RPC: complete (commits cec71cd..8f15ec5, static task review approved; PostgreSQL runtime pending Docker/Podman).
- Fase 3 availability: complete (commits 8a94973, df5cda4; 507 tests and build passed; task review Spec PASS / Quality APPROVED; deploy Firestore index before or with Function).
- Fase 4 memory: complete (commits cb21116, d8ebd18; 171 tests, type-check and lint passed; task review Spec PASS / Quality APPROVED; migration runtime pending Docker/Podman).
- Fase 5A proposed-actions contract: complete (commits 86c72ff, 0cbea64, 0c1d702; 184 tests, type-check and lint passed; task review Spec PASS / Quality APPROVED).
- Fase 5B1 appointment bridges: complete (see `fase5b1-appointment-bridges-report.md`).
- Fase 5B2 actions UI + execution: complete (APPROVED; commits through `bd5313f` / `a9dfc26`).
- Fase 5C telemetry + transparency panel: complete (APPROVED; commits 4349ab1..082f16f).
- Ops closure: remote migrations memory+suggestion_log applied; Firebase `PROSAVIS_CRM_BRIDGE_SECRET` + Supabase `FIREBASE_CRM_BRIDGE_SECRET` set; deployed `crmGetAvailableSlots`/`crmAppointmentActions` + 4 Inbox AI Edges; Firestore indexes deployed; `CRM_INBOX_AI_CONTEXTO.md` updated; HTTP smoke 401 OK; inbox UI smoke still manual.
- Inbox IA plan: COMPLETE pending human inbox smoke.
