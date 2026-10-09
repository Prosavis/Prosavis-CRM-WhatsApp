---
name: crm-inbox-operator
description: Operar el inbox CRM WhatsApp de Prosavis — contestar pendientes, enviar texto o plantilla, etiquetar sin borrar tags, verificar que el globo quedó en el hilo. Use when the user asks to reply to WhatsApp, handle CRM inbox, tag a chat, send a session message, or reopen a closed 24h window.
---

# Operador inbox CRM WhatsApp

Casa operativa: `publicidad/docs/messaging/`. Playbooks: `publicidad/docs/messaging/playbooks/`.

MCP: `grok-ops-mcp`. Rol: `bot_role=inbox` en **cada** tool. Escritura: `confirm_ok=true` + `user_order` = frase de Nicolás en este turno (≥ 8 caracteres).

## Antes de redactar

1. `crm_booking_context` (phone o stableKey). Mismos ojos que el ✨. Prohibido contestar solo con `crm_list_recent_messages`.
2. Hay dos líneas: **Citas 312** (bot) y **Comercial 311** (Francy / Business App). El bloque trae turns `[bot]` / `[comercial]`. **Antes de reactivar o ofrecer cupo, lee ambas.** Si el comercial ya cerró, no mandes plantilla.
3. Audios: el inbound ya transcribe; `[Audio transcrito]:` en `crm_booking_context` **es** el mensaje. Fotos: el packer ya trae `[Imagen]:` si hay análisis cacheado. Visión nueva solo si piden analizar/resumir (`includeImageAnalysis=true` o `crm_analyze_inbox_images`). No analices fotos por inercia.
4. No inventar COP. Oficiales: 4 h $88.000 · 6 h $118.000 · 8 h $148.000.
5. Francy no sugerir; Jennifer última opción.
6. Un envío por chat por turno, salvo orden extra.

Pendientes = `unread` o `crm_force_unread`, no archivado. Tool: `crm_list_pending_inbox` (tope 15). No son los ~200 last-inbound.

## Ventana Meta 24 h

| Ventana | Qué mandar |
| --- | --- |
| Abierta | `crm_send_text` |
| Cerrada / desconocida | Plantilla APPROVED. Reabrir: `welcome_greeting` (`es_CO`) |

`confirmacion_cita` sí puede ir con ventana cerrada (`ops_send_appointment_confirmation`).

Atajos `/bot`, `/approach`, `/precios`… son biblioteca (`crm_list_operator_kit` / `whatsapp_snippets`), no una máquina de estados.

## Tags

- `crm_list_tags` — catálogo (id, name). No inventar nombres.
- `crm_patch_tags` — **add/remove** sobre las actuales. Usar esto cuando pidan “ponle el tag X”.
- `crm_set_tags` — **reemplaza todas**. Solo si Nicolás pide replace explícito.
- Goteo `email enviado` → SQL merge, no replace.

## Encontrar un chat

`crm_search_inbox` (`query` / `name` / `phone`) — no solo los 15 unread.

## Tras enviar o etiquetar

`crm_verify_outbound` (phone + texto o `waMessageId`). Reportar: `waMessageId`, `stable_key`, `conversationUrl`, si el preview coincide.

El composer **no** se anima. El globo sí debe estar en `whatsapp_message_log` (`hidden_from_panel=false`) y en el preview.

URL: `https://prosavis-crm-whatsapp.vercel.app/whatsapp?conversation=<stable_key>&focusPhone=<tel>`

## Guardar copy reutilizable

`crm_upsert_snippet` — atajo `/` en `whatsapp_snippets` (misma tabla que el kit y la UI).

## Auto-agenda

Solo lectura: `ops_get_inbox_auto_agenda`. La enciende Jefe/Agenda. Si OFF, un “contesta pendientes” **no** crea cita.

V5 solo sugiere. Un humano mueve la agenda.

## Escalar (no envíes / no crees)

Queja, opt-out, cobro dudoso, precio especial, dirección ≠ directorio, hueco ocupado, persona concreta. Sticker/video/docs: no hay análisis. Fotos: solo si Nicolás lo pide.

## Playbooks

| Trigger | Playbook |
| --- | --- |
| Contesta pendientes / inbox / no leídos | `playbooks/pendientes.md` |
| Ponle el tag + escribe | `playbooks/tag-y-enviar.md` |
| Ventana 24 h cerrada | `playbooks/ventana-cerrada.md` |
| Precios / COP / cobertura | `playbooks/no-inventar-COP.md` |
