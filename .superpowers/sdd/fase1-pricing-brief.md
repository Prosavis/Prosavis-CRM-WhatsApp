# Fase 1A — Pricing grounded in code

Repository: `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp`

## Goal

Remove price and payment-link invention from Gemini. All commercial amounts must be resolved by deterministic code.

## Requirements

1. Add `supabase/functions/_shared/pricingCatalog.ts`.
2. Mirror the official duration catalog:
   - 120 minutes → COP 58,000
   - 180 minutes → COP 78,000
   - 240 minutes → COP 88,000
   - 360 minutes → COP 118,000
   - 480 minutes → COP 148,000
   - professional kit surcharge → COP 30,000
3. Export a typed `resolvePriceForDuration(minutes, withKit)` whose successful result includes the base price, kit surcharge, and `totalCOP`; invalid/unsupported durations return `null`.
4. Export `formatPricingCatalogBlock()` for model context.
5. In both:
   - `supabase/functions/suggest-whatsapp-agent-reply/index.ts`
   - `supabase/functions/get-whatsapp-booking-context/index.ts`
   remove `calculatedPrice` from fields Gemini is asked to calculate. Gemini may return only booking facts such as duration and `wantsKit`.
6. After parsing Gemini output, calculate `bookingContext.calculatedPrice` in code using `resolvePriceForDuration`.
7. Resolve Wompi links in code. Use `getStaticCleaningWompiUrl(basePrice)` without kit and `getStaticCleaningKitWompiUrl(basePrice)` with kit; do not pass the kit-inclusive total to the kit lookup.
8. Include the pricing catalog block in grounded context/system instructions so generated prose uses only official values.
9. Preserve all existing local user changes, especially the safety/early-arrival prompt and its test.
10. Update frontend booking types if `wantsKit` is exposed.
11. Add tests first and observe RED before implementation:
    - each duration maps to the exact official base price;
    - kit adds exactly COP 30,000;
    - invalid duration returns null;
    - formatting includes official values;
    - post-processing cannot retain a Gemini-invented `calculatedPrice`.
12. Run focused tests, then CRM type-check. Do not deploy.

## Constraints

- Do not modify or remove unrelated uncommitted work.
- Do not create a branch, worktree, commit, stash, reset, or checkout.
- No inline imports.
- Keep helpers Deno Edge-compatible and frontend-test import compatible.
- Report all changed files, RED/GREEN commands and outputs, remaining concerns.
