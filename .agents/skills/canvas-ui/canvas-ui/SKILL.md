---
name: canvas-ui
description: Installs and uses Canvas UI (canvasui.dev) html-in-canvas / WebGL effects via the shadcn registry @canvas-ui. Use when the user asks for Canvas UI, Bend, Liquid, Glass, html-in-canvas, canvasui.dev, or visual effects over live HTML in React/Vite/web projects — new repos or existing ones.
---

# Canvas UI

Tasteful html-in-canvas / WebGL effects over live HTML. Source is copied into the project (shadcn registry), not an npm package.

Docs: [canvasui.dev](https://canvasui.dev) · MCP: [canvasui.dev/docs/mcp](https://canvasui.dev/docs/mcp) · Install: [canvasui.dev/docs/installation](https://canvasui.dev/docs/installation)

Catalog: [components.md](components.md)

## When to use

- User wants Bend, Liquid, Glass, or any Canvas UI effect
- New React/Vite/web creation that needs a live-HTML visual effect
- Existing Prosavis web repo (Web, Panel, UserConsole, CRM)

**Do not** install into Flutter (`Prosavis-App`) or the publicidad HTML→PNG pipeline. Those are not React runtimes.

## Install a component (any repo)

Trusted namespace — works with or without pinning:

```powershell
npx shadcn@latest add @canvas-ui/<name>-react
```

Examples: `@canvas-ui/bend-react`, `@canvas-ui/liquid-react`, `@canvas-ui/glass-react`.

Suffix by framework: `-react` `-vue` `-svelte` `-solid` `-preact` `-vanilla`. Prosavis web = **`-react`**.

The CLI writes `components/canvasui/<Name>.tsx` (or `src/components/canvasui/` if aliases point at `src`). Move it under `src/components/canvasui/` in Vite apps if it landed at the repo root.

### Existing Vite + MUI (Web / Panel / UserConsole)

Do **not** run `npx shadcn init` — it pulls Tailwind and fights MUI.

1. Add only the registry pin to a `components.json` in that repo (copy [components.json](components.json); fix `aliases.components` / CSS path if needed).
2. `npx shadcn@latest add @canvas-ui/<name>-react`
3. Import from `@/components/canvasui/<Name>` (or the path where the file landed).
4. Wrap the UI the effect should run over. Do not replace MUI.

React 18 (Web/Panel/UserConsole) is fine: Canvas UI targets React 19 but the hooks used exist in 18. `"use client"` is a no-op in Vite.

### New React project

```powershell
npx shadcn@latest init
npx shadcn@latest add @canvas-ui/bend-react
```

Pin in `components.json`:

```json
"registries": {
  "@canvas-ui": "https://canvasui.dev/r/{name}.json"
}
```

### Manual copy

If the CLI is too invasive: open the component page, copy the React source into `src/components/canvasui/`, install any listed deps (e.g. `three` for object components).

## Use it

```tsx
import { Bend } from "@/components/canvasui/Bend";

export function Page() {
  return (
    <Bend style={{ height: "100vh" }}>
      <YourContent />
    </Bend>
  );
}
```

Props are optional and can change live. See the component page for the API.

## Browser (html-in-canvas)

Components marked **html-in-canvas** on their docs page need Chrome's canvas-draw-element API.

- Dev: `chrome://flags/#canvas-draw-element` → enable → restart Chrome.
- Prod: [origin trial](https://developer.chrome.com/blog/html-in-canvas-origin-trial) bound to **your domain** (token via meta or HTTP header). The token on canvasui.dev does not help Prosavis domains.
- Unsupported browsers: content renders as normal HTML; no errors.

Object components (ASCII Object, Glass Object, …) use three.js and do not need that flag.

## MCP

Cursor and OpenCode already have the **shadcn** MCP (user-level). The suite workspace pins `@canvas-ui` in a local `GitHub/components.json` (gitignored) so the MCP can list/search without `shadcn init`.

When **adding** a component, run the CLI with `--cwd` set to the target repo (never install into `GitHub/` root):

```powershell
npx shadcn@latest add @canvas-ui/bend-react --cwd Prosavis-Web
```

If the server is missing: Settings → MCP → enable `shadcn`. Config lives in `%USERPROFILE%\.cursor\mcp.json`.

Do not add a project-level `.cursor/mcp.json` that duplicates the user-level server.

## Rules

- Install **on demand** into the repo that will render the effect. Do not dump every Canvas UI component into every repo.
- Keep effects as wrappers around existing UI. Do not rewrite the design system.
- Prefer MCP `shadcn` or the CLI over pasting stale copies from chat.
- After adding files, run the project's `lint` / `type-check`.
