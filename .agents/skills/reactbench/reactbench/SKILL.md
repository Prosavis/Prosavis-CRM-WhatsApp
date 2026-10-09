---
name: reactbench
description: Uses ReactBench (reactbench.com) to choose coding models for React work by score vs cost. Use when picking a model for Panel/UserConsole/Web/CRM, comparing Cursor/OpenCode models for React quality, or deciding if a cheap model is enough for hooks/effects/a11y/perf work.
---

# ReactBench

Leaderboard for coding agents on **realistic React** (performance, accessibility, anti-patterns) — not just unit-test pass rates.

- Live: [reactbench.com](https://www.reactbench.com/)
- Prosavis snapshot + heuristics: `prosavis-firebase/docs/context/reactbench.md`
- Code scan companion: React Doctor — `prosavis-firebase/docs/desarrollo/react-doctor-calidad-frontend.md`

## When to invoke

- User asks which model to use for React / frontend
- Hard React work: `useEffect`, listeners, nested state, MUI prop inference, a11y, Core Web Vitals
- Cost vs quality tradeoff for Panel, UserConsole, Web, or CRM WhatsApp
- Before a large React refactor or quality wave

**Skip** for Flutter, publicidad HTML→PNG, Firebase-only backend, pure docs.

## Procedure

1. Read `prosavis-firebase/docs/context/reactbench.md` (heuristics + snapshot).
2. If the snapshot is stale (>~30 days) or the user asks for “latest”, fetch [reactbench.com](https://www.reactbench.com/) and prefer live numbers.
3. Classify the task:

| Task | Prefer |
|------|--------|
| Hard React / production-risk | High ReactBench score (e.g. GPT 5.6 Terra/Sol Max, Opus 5 Max) |
| Medium React feature | Mid score/cost (Terra High, Grok 4.5 High, Luna Max — confirm on site) |
| Mechanical / low-risk edit | Cheap model OK; still lint + type-check |

4. Recommend a model **available in the current product** (Cursor picker / OpenCode). Map bench names to the closest available slug.
5. Remind: pair hard changes with `vercel-react-best-practices` and, for quality waves, React Doctor.

## Output

Keep it short:

- Recommended model (+ effort if relevant)
- Why (1 line: score/cost or risk)
- Optional second choice if budget-constrained
- Link to reactbench.com if numbers were refreshed

## Do not

- Treat Pass@1 as “safe for production”
- Use Composer-class models alone for subtle hooks/leaks/a11y without a stronger pass or doctor scan
- Invent scores — cite the snapshot doc or the live site
