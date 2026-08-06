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
