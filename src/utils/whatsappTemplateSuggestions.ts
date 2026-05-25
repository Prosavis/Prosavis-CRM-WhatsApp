import type {
  BookingContextData,
  WhatsAppMessage,
  WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import {
  countSlotsForTemplate,
  getExampleValues,
} from './whatsappTemplateHelpers';

const META_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WhatsAppTemplateSuggestionContext {
  bookingContext: BookingContextData;
  conversationDisplayName?: string;
  lastInboundAt: Date | null;
  lastMessageDirection?: 'inbound' | 'outbound';
}

export interface WhatsAppTemplateSuggestion {
  template: WhatsAppTemplateSummary;
  reason: string;
  headerValues: string[];
  bodyValues: string[];
  sessionExpired: boolean;
}

const RETURNING_CLIENT_PRIORITY = [
  'react_cliente_antigua_fecha',
  'react_cliente_hace_tiempo',
  'react_cliente_misma_profesional',
  'rebooking_suave_v2',
  'rebooking_frecuencia',
];

const WARM_LEAD_PRIORITY = [
  'react_followup_sin_respuesta_v2',
  'react_followup_semanas_sin_contacto',
  'react_followup_valor_sin_presion',
  'seguimiento_suave',
  'seguimiento_final',
];

const COLD_OUTREACH_PRIORITY = [
  'outreach_intro_prosavis',
  'outreach_invitacion_agendar',
  'outreach_respuesta_si_quiere_precios',
  'welcome_greeting',
];

export function getLastInboundAt(messages: WhatsAppMessage[]): Date | null {
  const inbound = [...messages]
    .reverse()
    .find((message) => message.direction === 'inbound' && message.createdAt);
  return inbound?.createdAt ?? null;
}

export function isWithinMetaSessionWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  const age = now.getTime() - lastInboundAt.getTime();
  return age >= 0 && age <= META_SESSION_WINDOW_MS;
}

export function filterApprovedSpanishTemplates(
  templates: WhatsAppTemplateSummary[],
): WhatsAppTemplateSummary[] {
  const approved = templates.filter((template) => template.status === 'APPROVED');
  const esCo = approved.filter((template) => template.language === 'es_CO');
  const esAny = approved.filter(
    (template) => typeof template.language === 'string' && template.language.startsWith('es'),
  );
  return esCo.length ? esCo : esAny.length ? esAny : approved;
}

export function selectWhatsAppTemplateSuggestion(
  templates: WhatsAppTemplateSummary[],
  context: WhatsAppTemplateSuggestionContext,
): WhatsAppTemplateSuggestion | null {
  const sessionExpired = !isWithinMetaSessionWindow(context.lastInboundAt);
  if (!sessionExpired) return null;

  const availableTemplates = filterApprovedSpanishTemplates(templates);
  const byName = new Map(availableTemplates.map((template) => [template.name, template]));
  const isReturningClient = context.bookingContext.clientInfo.isReturningClient;
  const hasUsefulThread = Boolean(context.lastInboundAt || context.lastMessageDirection);

  const priorities = isReturningClient
    ? RETURNING_CLIENT_PRIORITY
    : hasUsefulThread
      ? WARM_LEAD_PRIORITY
      : COLD_OUTREACH_PRIORITY;

  const template =
    priorities.map((name) => byName.get(name)).find(Boolean) ??
    COLD_OUTREACH_PRIORITY.map((name) => byName.get(name)).find(Boolean) ??
    WARM_LEAD_PRIORITY.map((name) => byName.get(name)).find(Boolean) ??
    null;

  if (!template) return null;

  return {
    template,
    reason: buildSuggestionReason(template.name, context),
    headerValues: buildHeaderValues(template),
    bodyValues: buildBodyValues(template, context),
    sessionExpired,
  };
}

function buildSuggestionReason(
  templateName: string,
  context: WhatsAppTemplateSuggestionContext,
): string {
  if (context.bookingContext.clientInfo.isReturningClient) {
    return 'La conversación salió de la ventana de 24h y el contacto aparece como cliente recurrente.';
  }
  if (templateName.startsWith('outreach_')) {
    return 'No hay una sesión activa con el cliente; conviene usar una plantilla de activación manual.';
  }
  return 'El último mensaje del cliente ya no mantiene abierta la ventana de servicio de Meta.';
}

function buildHeaderValues(template: WhatsAppTemplateSummary): string[] {
  const { header } = countSlotsForTemplate(template);
  const examples = getExampleValues(template.components, 'HEADER');
  return Array.from({ length: header }, (_, index) => examples[index] || '');
}

function buildBodyValues(
  template: WhatsAppTemplateSummary,
  context: WhatsAppTemplateSuggestionContext,
): string[] {
  const { body } = countSlotsForTemplate(template);
  const examples = getExampleValues(template.components, 'BODY');
  const name = resolveClientName(context);
  const valuesByName = getTemplateValuesByName(template.name, name, context);

  return Array.from({ length: body }, (_, index) => {
    const custom = valuesByName[index];
    if (custom) return custom;
    if (index === 0) return name;
    return examples[index] || defaultValueForIndex(index);
  });
}

function resolveClientName(context: WhatsAppTemplateSuggestionContext): string {
  return (
    context.bookingContext.clientInfo.name?.trim() ||
    context.conversationDisplayName?.trim() ||
    'hola'
  );
}

function getTemplateValuesByName(
  templateName: string,
  name: string,
  context: WhatsAppTemplateSuggestionContext,
): string[] {
  switch (templateName) {
    case 'react_followup_semanas_sin_contacto':
    case 'react_cliente_hace_tiempo':
      return [name, describeInactiveWindow(context.lastInboundAt)];
    case 'react_cliente_antigua_fecha':
      return [name, 'tu último servicio'];
    case 'outreach_intro_prosavis':
      return [name, 'limpieza profesional con personal verificado en Pereira'];
    case 'seguimiento_incentivo':
      return [name, 'esta semana'];
    default:
      return [name];
  }
}

function describeInactiveWindow(lastInboundAt: Date | null): string {
  if (!lastInboundAt) return 'un tiempo';
  const days = Math.max(1, Math.round((Date.now() - lastInboundAt.getTime()) / 86_400_000));
  if (days >= 60) return 'unos meses';
  if (days >= 14) return 'unas semanas';
  if (days >= 7) return 'una semana';
  return 'varios días';
}

function defaultValueForIndex(index: number): string {
  if (index === 1) return 'unas semanas';
  return '—';
}
