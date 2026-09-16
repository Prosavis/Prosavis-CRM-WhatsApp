# Solicitudes de empleo y análisis documental

**Estado:** Implementación activa  
**Fecha:** 16/09/2026  
**Proyecto:** Prosavis-CRM-WhatsApp (Supabase `djzwjaegxbhlefanmmee`) + puente Equipo en `prosavis-firebase`

## 1. Propósito

El CRM tenía postulaciones mezcladas con clientes: tags `Job` / `Marian` en `crm_directory` y la categoría inbox `Trabajo / CV`. Este módulo separa el dominio de reclutamiento:

- Un **contacto remitente** (`crm_directory`) no es necesariamente la persona candidata.
- Una **solicitud** es el ciclo de selección de una **candidata**.
- Un remitente puede enviar varias hojas de vida; cada persona extraída es un expediente distinto.
- La analítica y la contratación se auditan; `Contratada` solo existe si hay un miembro real en Equipo.

## 2. Glosario

| Término | Definición |
|---|---|
| Contacto / remitente | Fila de `crm_directory` que envía o etiqueta un chat. Puede no ser la postulante. |
| Candidata | Persona identificada como interesada (`job_candidates`). |
| Solicitud | Ciclo de selección de una candidata (`job_applications`). Tabla principal pedida. |
| Fuente | Evidencia de origen: tag, conversación, mensaje, intent o carga manual. |
| Documento | Bytes persistidos (`document_assets`) con origen (`document_sources`). |
| Análisis | Job durable + resultado JSON versionado (`document_analysis_*`). |
| Evento | Cambio append-only de etapa, asignación, split, merge, contratación o borrado. |
| Contratación | Estado `hired` solo cuando `team_member_id` apunta a `crm_team_members`. |
| Cohorte Job | Tags/aliases de auxiliares de limpieza. Entran a KPI. |
| Cohorte Marian | Peticiones especiales; segmento secundario, fuera de KPI principales. |

## 3. Navegación

- Desktop: Bot → Comercial → Directorio → **Solicitudes de empleo** → Descuentos.
- Móvil: Bot / Comercial / Directorio / Más. El módulo vive en Más.
- URL: `/whatsapp?tab=jobs` (`applicationId` opcional para abrir expediente).

## 4. Embudo

Etapas canónicas (código → UI):

| Código | UI |
|---|---|
| `new` | Nueva |
| `pending_review` | Por revisar |
| `contacted` | Contactada |
| `interviewed` | Entrevistada |
| `trial` | En prueba |
| `possible` | Posible |
| `hired` | Contratada |
| `rejected` | Descartada |
| `withdrawn` | Retirada |

`hired` exige vínculo a Equipo. La IA no contrata ni descarta.

## 5. Servicio documental reusable

Capa interna (sin pantalla genérica en v1):

- Acepta blob ya persistido (WhatsApp o upload).
- Normaliza MIME, tamaño, SHA-256.
- PDF nativo o escaneado vía Gemini `application/pdf` (máx. 50 MB / 15 páginas en v1).
- Imágenes y audio con prompts de extracción laboral; no reusa el texto de cotización del inbox.
- Cache por `(sha256, kind, schema_version, model)`.
- Cola propia con lease/reintentos (patrón `ops_backfill_queue`). Worker vía Edge + `pg_cron`/`pg_net`.

Fuera de alcance v1: generación de PDF, análisis de video, KYC, Document AI.

## 6. Identidad y split

- Dedupe automático solo con identidad fuerte no conflictiva: cédula normalizada, o email exacto, o teléfono de 10 dígitos **y** nombre exacto.
- Homónimos y PDFs multi-persona → `needs_review`.
- Split crea candidata + solicitud nuevas y mueve documentos elegidos.
- Autoría histórica: `system/backfill` + etiqueta “Migración histórica / actor desconocido”.

## 7. Privacidad

- Se guarda evidencia, finalidad, versión del aviso y origen.
- `sensitive_consent_status = not_collected`. No se marca consentimiento explícito inexistente.
- Riesgo jurídico: la autorización del operador no sustituye la del titular (Ley 1581 / SIC).
- Retención `until_deletion_request`. Borrado completo revoca URLs y anonimiza eventos analíticos.
- Identificación enmascarada en listados; URL firmada para el archivo.

## 8. Auditoría RLS previa

Remoto (16/09/2026): `crm_directory` **sí** tiene RLS y políticas `admins_*_directory` para `authenticated` vía `admin_profiles`. Las migraciones git no documentaban esas políticas; no se cambia el contrato de Directorio.

## 9. Verificación

- pgTAP: relaciones, transiciones, RLS, leasing, métricas, idempotencia.
- Deno: extracción, split, dedupe.
- Vitest/RTL: tabs, filtros, expediente.
- Dry-run de backfill contra 141 Job / 65 Marian.
