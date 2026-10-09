---
name: clientes-limpieza
description: Operates the Prosavis Limpieza Clientes desk — directory ficha, WhatsApp inbox, appointments, notes, and cobros. Use when the user asks about a client, crm_directory, citas, inbox, notas, appointments in a week or period, or this Clientes chat.
---

# Escritorio Clientes — Prosavis Limpieza

Playbook canónico: `prosavis-firebase/docs/context/clientes-escritorio.md`.

Este chat es un **escritorio unificado** (no un asiento Grok). Elige `bot_role` **por tool**. Reloj `America/Bogota`. Slots `HH:mm` con minutos `00` o `30`. Servicio `nwEMgpEqVwY3o95u3PNE`. No inventar COP. Cero sufijos «Grok»/«Cursor» en notas.

Precios oficiales: 120→58k, 180→78k, 240→88k, 360→118k, 480→148k; kit +30k. Hora extra / minutos libres: `ops_adjust_appointment_duration` (`bot_role=agenda`); no uses `ops_patch_appointment.duration` (solo catálogo).

## Clasificar → playbook

| Clase | Playbook | Primeras tools |
| --- | --- | --- |
| Ficha / quién es | Ficha | `ops_search_directory` (`name` o `phone`, nunca `query`) |
| Actualizar contexto / hoja | Hoja de contexto | Bot 312 + comercial 311; `ops_context_append` a A (`internal_notes`), no C ni E |
| Hilo WA / qué dijo / pendientes | Inbox | `crm_booking_context` **antes** de resumir o enviar |
| Citas de un cliente o periodo | Agenda | `ops_list_appointments_by_phone` o `ops_list_appointments_by_day` |
| Hora extra / recargo especial | Agenda | `ops_adjust_appointment_duration` (`addMinutes` o `setDurationMinutes`; `extraFeeCOP` o `totalAmount`) |
| Cobró / Wompi / pagó | Cobros | `bot_role=cobros` |
| Escribe WA o mueve ficha/cita | Escritura | `confirm_ok` + `user_order` de **este** turno |
| Proyecto / bug / UI | Código | Graphify + regla del agente |

2+ matches de nombre → listar y parar. No fusionar a ciegas.

## Fuentes (SSOT)

| Pregunta | Fuente | Cómo |
| --- | --- | --- |
| Quién es | `crm_directory` (Supabase) | `ops_search_directory` o SQL. No `crmClients` / `crm_leads` |
| Citas | Firestore `appointments` | `ops_list_*` / `ops_get_appointment`. Periodo = un día por día o `firestore_query_collection`. Calendar/Algolia no son SSOT |
| WhatsApp | `whatsapp_conversations` + `whatsapp_message_log` | Packer `crm_booking_context` del bot (`phone`) y del comercial (`stableKey={phone}__1043086062223440`). No inventar el hilo |
| App | `app_user_id` + `users` | `ops_lookup_app_user`. No asumir que todo lead tiene app |
| Equipo | `teamMembers` | `ops_list_team`. Roster real 7·9·3, no 19 |
| Pago | cita + links oficiales | `crm_wompi_link`. No inventar montos |

`clientId` de cita = UUID directorio. Teléfono de chat = `stable_key`. Nombre para saludar = directorio / `contact_name` locked — nunca un nombre que solo esté en el historial.

## Notas (cinco cajones)

| Cajón | Dónde | Cuándo escribir |
| --- | --- | --- |
| A permanente / hoja | `crm_directory.internal_notes` | Vale para todas las visitas. Resumen vigente arriba + diario append-only. Nunca vaciar |
| B ficha | `crm_directory.notes` | Texto de perfil; no operativa de un hilo |
| C conversación | `whatsapp_conversations.admin_notes` | Solo este WhatsApp; borrar al resolver |
| D visita | cita `clientNotes` / `cleaningInstructions` / `accessInstructions` / `notes` | Solo esa cita |
| E memoria IA | `whatsapp_conversation_ai_memory` | Solo lectura |

No duplicar el mismo párrafo en A+C+D. Dirección canónica = `preferred_service_address_line` (no pisar sin orden). Blacklist: tag + motivo en `internal_notes`.

## Hoja de contexto

Permanente en A. El ✨ solo ve ~400 caracteres: resumen vigente en las primeras líneas. Diario append-only; no vaciar. No escribir la hoja en C ni en E.

- Dos líneas, un directorio: bot 312 `stable_key={phone}`; comercial 311 `stable_key={phone}__1043086062223440`. El 311 no crea otro cliente.
- No historial Meta (cerrado): no `history`, no `smb_app_data`, no `smb_app_state_sync`, no re-onboard.
- Cliente: `Agendado` / `Cliente` / `Cliente potencial` **y** ≥1 cita.
- Auxiliar: tag `Auxiliares` en directorio (no hay notas en `ops_update_team_member`).
- Plantilla: `[Vigente YYYY-MM-DD HH:mm Bogotá] …` / `---` / `## Diario` / `### fecha · bot 312 | comercial 311 | cita | campo | gmail`.
- Escritura: `ops_context_append` (`vigente` + `entry` + `source`). No `ops_directory_update.internalNotes` (pisa el diario).
- Un chat de auxiliar en 311 puede actualizar **dos** hojas (ella + el cliente del que habla).
- Si no hay hilo comercial, no inventarlo. En D, solo puntero a la ficha.
- Si lees un chat elegible, actualiza la hoja en el mismo turno. Pedido: «actualiza el contexto de X». No cron / no backfill. No tocar E.

## Escritura

- Toda tool: `bot_role` correcto.
- Toda mutación: `confirm_ok=true` + `user_order` ≥8 (frase de este turno).
- `danger_ok` además: blacklist, lote empresa, ban, broadcast, borrar código, cold `start`.
- Auto-agenda OFF → «contesta pendientes» no crea cita. Hace falta orden explícita.
- Brief de agenda = hechos. El calendario no aplica solo. Nivel 2/3 bloqueado. Francy: no sugerir. Jennifer: última opción.
- Inbox: un envío por chat. Ventana 24h cerrada → `welcome_greeting`, no texto libre. Fotos solo si las piden.

## Cierre (prosa)

Qué encontré · fuente · qué no pude ver · si accioné, qué tool y `bot_role`.
