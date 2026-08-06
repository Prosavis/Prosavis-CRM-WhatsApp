# Fase 2 — Contexto operativo y presupuestos

Repository: `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp`

## Goal

Add already-available CRM operational knowledge to the Inbox AI context while enforcing deterministic section and total character budgets.

## Requirements

1. Replace `loadConversationTags` with `loadConversationContext`.
   - Query `tag_ids`, `admin_notes`, `assigned_to`, `last_intent`, `automated_inbound_disabled`.
   - Resolve active tag names exactly as today.
   - Add a typed conversation context to `InboxAiContext`.
2. Extend directory loading/types/formatting with:
   - `source`
   - `service_id`
   - `classification`
   - `payment_status`
   - `opt_out`
3. Load official answers server-side:
   - active pinned `whatsapp_snippets` only, ordered by `sort_order`, then shortcut;
   - active `crm_faqs`, selecting `question`, `answer`, `category`, `keywords`;
   - explicit row limits and per-entry clipping;
   - failures degrade to an empty list and a structured warning, without failing suggestions.
4. Add a section exactly headed `=== Respuestas oficiales de la casa ===`.
   - Include pinned snippets and active FAQs.
   - Instruct the model to reuse official phrasing before improvising.
5. Add a `=== Contexto operativo de conversación ===` section and a `=== Clasificación CRM ===` section.
6. Export `SECTION_CHAR_BUDGETS` and a total block ceiling.
   - The existing transcript budget is 60,000 characters.
   - The complete formatted block must never exceed 78,000 characters.
   - Each variable section must be clipped independently before final assembly so official answers cannot evict the latest transcript.
   - Preserve headings and indicate truncation explicitly.
7. Strengthen `INBOX_AI_SYSTEM_INSTRUCTION` to prefer official house answers.
8. Keep service-role access server-side only; do not expose secrets or add browser data access.
9. Preserve all Fase 1 behavior and concurrent V5 work.
10. TDD:
    - conversation operational fields map and format;
    - directory classification fields map and format;
    - only pinned/active snippets and active FAQs appear;
    - oversized entries are clipped;
    - each section respects its budget;
    - the complete block is `<= 78_000` chars with a 60k transcript;
    - query failures degrade without breaking context.
11. Run focused tests, full CRM tests, type-check, and focused lint.
12. Commit only task files locally to `master`; no push or deploy.
