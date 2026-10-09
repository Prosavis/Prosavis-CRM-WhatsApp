# Bugbot — Prosavis

Revisa el diff del PR. No propongas activar GitHub Actions ni editar `.github/workflows`: Actions está apagado por billing (01/09/2026) y el deploy va por CLI.

## Siempre

- Imports al inicio del módulo. Nada de imports dentro de funciones, salvo un ciclo de dependencias documentado.
- En un `switch` de unión discriminada o enum, el `default` asigna a `never`.
- Coex WhatsApp 311: no vincular historial ni agenda Meta (`history`, `smb_app_data`, `smb_app_state_sync`, re-onboard). La línea de automatización es el 312.
- Rama de casa: Prosavis-App `develop`; prosavis-firebase, Panel, UserConsole, Web y publicidad `main`; CRM `master`. Una rama `feature/` solo si el PR lo pide.
- No secretos, no `.env`, no tokens en el diff.
- No copies playbooks enteros a rules ni a comentarios.

## Stack de este repo

React + Supabase + Vercel. SSOT de contactos: `crm_directory`. Migraciones revisables y hacia adelante. Deploy de Vercel y de Edges por CLI, no por Actions. No abras historial ni agenda de la línea 311.
