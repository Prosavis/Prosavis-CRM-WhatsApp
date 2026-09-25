# Prosavis-CRM-WhatsApp

Reglas de cuenta (User Rules) y las de este repo se aplican juntas. Canon: `prosavis-firebase/workspace/rules/`.

## Operación

- Rama de trabajo: `main` o `master` según `origin/HEAD`. No abras `feature/` salvo pedido explícito.
- GitHub Actions: OFF hasta que Nicolás lo pida en este turno. Deploy de Vercel y Edges por CLI, no por Actions.
- Correo: preguntar support@ o comercial@ antes de enviar.
- Coex 311: no historial ni agenda Meta. Doc: `prosavis-firebase/docs/context/whatsapp-coex-no-historial.md` si el sibling está en el workspace.
- Graphify: úsalo si existe `graphify-out/` (suite local). En cloud agent o sin grafo, no bloquees el trabajo.

## Stack

React + Supabase + Vercel + WhatsApp. Skills: `.cursor/rules/skills-mandatory.mdc`. Agente: `.cursor/rules/agent-vercel-supabase-waba.mdc`.
TypeScript: `.cursor/rules/typescript-standards.mdc`. MCP: `.cursor/rules/mcp-map.mdc`.
SSOT de contactos: `crm_directory`. Lockfile de la suite: `prosavis-firebase/workspace/skills-lock.json`.
