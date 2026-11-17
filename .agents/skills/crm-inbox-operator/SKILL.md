---
name: crm-inbox-operator
description: Operar el inbox CRM WhatsApp de Prosavis — contestar pendientes, enviar texto o plantilla, etiquetar sin borrar tags, verificar que el globo quedó en el hilo. Use when the user asks to reply to WhatsApp, handle CRM inbox, tag a chat, send a session message, or reopen a closed 24h window.
---

# Operador inbox CRM WhatsApp

Casa operativa: `publicidad/docs/messaging/`. Playbooks: `publicidad/docs/messaging/playbooks/`.

MCP: `prosavis-hub`, asiento `whatsapp`. No se manda `bot_role`. Escritura de nivel 1 o 2: `confirm_ok=true` + `user_order` = frase de Nicolás en este turno (≥ 8 caracteres). Casa: `prosavis-firebase/docs/prosavis-hub/grok/02-whatsapp.md`.

## Antes de redactar

1. `whatsapp_chat_contexto` (phone o stableKey). Mismos ojos que el ✨. Prohibido contestar solo con `whatsapp_mensaje_listar`.
2. Hay dos líneas: **Citas 312** (bot) y **Comercial 311** (Francy / Business App). El bloque trae turns `[bot]` / `[comercial]`. **Antes de reactivar o ofrecer cupo, lee ambas.** Si el comercial ya cerró, no mandes plantilla.
3. Audios: el inbound ya transcribe; `[Audio transcrito]:` en `whatsapp_chat_contexto` **es** el mensaje. Fotos: el packer ya trae `[Imagen]:` si hay análisis cacheado. Visión nueva solo si piden analizar/resumir (`includeImageAnalysis=true` o `whatsapp_imagen_describir`). No analices fotos por inercia.
4. No inventar COP. Oficiales: 4 h $88.000 · 6 h $118.000 · 8 h $148.000.
5. Francy no sugerir; Jennifer última opción.
6. Un envío por chat por turno, salvo orden extra.

Pendientes = `unread` o `crm_force_unread`, no archivado. Tool: `whatsapp_chat_pendientes` (tope 15). No son los ~200 last-inbound.

## Ventana Meta 24 h

| Ventana | Qué mandar |
| --- | --- |
| Abierta | `whatsapp_sesion_enviar` |
| Cerrada / desconocida | Plantilla APPROVED. Reabrir: `welcome_greeting` (`es_CO`) |

`confirmacion_cita` sí puede ir con ventana cerrada (`agenda_cita_confirmar`).

Atajos `/bot`, `/approach`, `/precios`… son biblioteca (`whatsapp_atajo_listar` / `whatsapp_snippets`), no una máquina de estados.

## Tags

- `whatsapp_etiqueta_listar` — catálogo (id, name). No inventar nombres.
- `whatsapp_chat_etiquetas` — **add/remove** sobre las actuales. Usar esto cuando pidan “ponle el tag X”. Reemplazar todas solo si Nicolás lo pide.
- Goteo `email enviado` → SQL merge, no replace.

## Encontrar un chat

`whatsapp_chat_buscar` (`query` / `name` / `phone`) — no solo los 15 unread.

## Tras enviar o etiquetar

`whatsapp_envio_verificar` (phone + texto o `waMessageId`). Reportar: `waMessageId`, `stable_key`, `conversationUrl`, si el preview coincide.

El composer **no** se anima. El globo sí debe estar en `whatsapp_message_log` (`hidden_from_panel=false`) y en el preview.

URL: `https://prosavis-crm-whatsapp.vercel.app/whatsapp?conversation=<stable_key>&focusPhone=<tel>`

## Guardar copy reutilizable

`whatsapp_atajo_guardar` — atajo `/` en `whatsapp_snippets` (misma tabla que el kit y la UI).

## Auto-agenda

Solo lectura: `agenda_auto_leer`. La enciende el asiento de agenda. Si OFF, un “contesta pendientes” **no** crea cita.

V5 solo sugiere. Un humano mueve la agenda.

## Cobro

Un `cobro_*` cada 7 días y un solo número (312, 311 o teléfono). Lun–vie 7:00–19:00, sábado 8:00–15:00, nunca domingo ni festivo. El servidor rechaza la plantilla; no la reintentes. Teléfono: anótalo en el cajón con la fecha y no mandes WhatsApp esa semana. No preguntes por qué no pagó ni escribas a terceros. Casa: `prosavis-firebase/docs/context/cobros-whatsapp.md`.

## Escalar (no envíes / no crees)

Queja, opt-out, cobro dudoso, precio especial, dirección ≠ directorio, hueco ocupado, persona concreta. Sticker/video/docs: no hay análisis. Fotos: solo si Nicolás lo pide.

## Playbooks

| Trigger | Playbook |
| --- | --- |
| Contesta pendientes / inbox / no leídos | `playbooks/pendientes.md` |
| Ponle el tag + escribe | `playbooks/tag-y-enviar.md` |
| Ventana 24 h cerrada | `playbooks/ventana-cerrada.md` |
| Precios / COP / cobertura | `playbooks/no-inventar-COP.md` |
