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

<!-- cursor-cloud -->
## Cursor Cloud specific instructions

Esta VM solo tiene este checkout. `GitHub/` no es un repo: no están el `AGENTS.md` de la suite, `GitHub/.cursor/rules`, `GitHub/.agents/skills` ni `graphify-out/`.

- **Graphify.** No hay grafo aquí. No bloquees el trabajo y no clones `graphify-out/`.
- **Skills.** El bundle de este repo es `.agents/skills/`. Las de `~/.cursor/skills` solo llegan si en la cuenta está activo *Settings → Agents → Sync Skills for Cloud Agents*. `~/.agents/skills` no se sincroniza.
- **Prosavis-PC.** Flutter (`flutter analyze` y tests), `npx firebase deploy`, Graphify, `gmail-28`, Meta Ads completo (`prosavis-meta-ads`) y los MCP stdio (`dart`, `shadcn`, Firebase CLI) corren en el worker `Prosavis-PC` o en `Prosavis-PC-<repo>`. El SDK del PC es Flutter 3.44.4 / Dart 3.12. La App declara `sdk: >=3.10.0 <4.0.0` y no usa FVM: no instales Flutter en esta VM.
- **Grok opera, Cursor programa.** `grok-ops-mcp` en esta sesión es solo contexto de lectura. No crees citas, no mandes WhatsApp, no toques nómina, cobros, facturas ni el estado de un anuncio. No pases `confirm_ok`, `danger_ok` ni `standing_ok`. Eso queda en el canal Estado Mayor de Grok.
- **CI.** GitHub Actions está apagado (bloqueo de billing, 01/09/2026). No edites `.github/workflows` ni lances `gh workflow run` o `gh workflow enable`. El reemplazo es el `install` de `.cursor/environment.json` y los comandos de abajo, sin `.env` y sin secretos de producción.
- **Ramas de casa.** Prosavis-App: `develop` (`master` solo en release). prosavis-firebase, Panel, UserConsole, Web, publicidad y puente: `main`. CRM: `master`. No abras `feature/` salvo pedido explícito, o una implementación grande de la App.
- **Coex 311.** No vincules historial ni agenda de Meta (`history`, `smb_app_data`, `smb_app_state_sync`, re-onboard).
- **Correo.** Pregunta si va por `support@` o por `comercial@` antes de redactar. Sin esa respuesta, no envíes.
- **Un PR por repo.** La regla de stack está en `.cursor/rules/agent-*.mdc` de este checkout.

### Verificación en esta VM

`npm test`, `npm run type-check` y `npm run lint`. Sin `.env`. Deploy de Vercel y de Edges por CLI, no por Actions.
<!-- /cursor-cloud -->
