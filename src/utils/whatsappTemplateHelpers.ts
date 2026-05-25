import type { WhatsAppTemplateSummary } from '@/services/whatsappService';

export interface WhatsAppTemplateSendComponent {
  type: 'header' | 'body';
  parameters: Array<{ type: 'text'; text: string }>;
}

export function maxPlaceholderIndex(text: string): number {
  let max = 0;
  const re = /\{\{(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    max = Math.max(max, parseInt(match[1], 10));
  }
  return max;
}

export function countSlotsForTemplate(
  template: WhatsAppTemplateSummary,
): { header: number; body: number } {
  let header = 0;
  let body = 0;
  for (const component of template.components || []) {
    const typed = component as { type?: string; text?: string };
    const text = typed.text || '';
    const slots = maxPlaceholderIndex(text);
    if (typed.type === 'BODY') body = Math.max(body, slots);
    if (typed.type === 'HEADER' && text) header = Math.max(header, slots);
  }
  return { header, body };
}

export function getComponentText(components: unknown[], type: string): string | undefined {
  for (const raw of components || []) {
    const component = raw as { type?: string; text?: string };
    if (component.type === type && typeof component.text === 'string') return component.text;
  }
  return undefined;
}

export function getExampleValues(components: unknown[], type: string): string[] {
  for (const raw of components || []) {
    const component = raw as {
      type?: string;
      example?: { body_text?: string[][]; header_text?: string[] };
    };
    if (component.type === type) {
      if (type === 'BODY' && component.example?.body_text?.[0]) return component.example.body_text[0];
      if (type === 'HEADER' && component.example?.header_text) return component.example.header_text;
    }
  }
  return [];
}

export function applyPlaceholderPreview(text: string): string {
  return text.replace(/\{\{\d+\}\}/g, '…');
}

export function previewTextForList(template: WhatsAppTemplateSummary): string {
  const header = getComponentText(template.components, 'HEADER');
  const body = getComponentText(template.components, 'BODY') || '';
  const headerPreview = header ? applyPlaceholderPreview(header) : '';
  const bodyPreview = applyPlaceholderPreview(body);
  const combined = [headerPreview, bodyPreview].filter(Boolean).join('\n\n');
  return combined.trim() || template.name;
}

export function applyPlaceholdersToText(text: string, values: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, group) => {
    const index = parseInt(group, 10) - 1;
    const value = values[index]?.trim();
    return value || '…';
  });
}

export function buildDisplayMessageBody(
  template: WhatsAppTemplateSummary,
  headerValues: string[],
  bodyValues: string[],
): string {
  const headerText = getComponentText(template.components, 'HEADER');
  const bodyText = getComponentText(template.components, 'BODY') || '';
  const parts: string[] = [];
  if (headerText) parts.push(applyPlaceholdersToText(headerText, headerValues));
  if (bodyText) parts.push(applyPlaceholdersToText(bodyText, bodyValues));
  const main = parts.join('\n\n').trim();
  return main ? `[Plantilla: ${template.name}]\n${main}` : `[Plantilla] ${template.name}`;
}

export function buildTemplateSendComponents(
  template: WhatsAppTemplateSummary,
  headerValues: string[],
  bodyValues: string[],
): WhatsAppTemplateSendComponent[] {
  const { header, body } = countSlotsForTemplate(template);
  const components: WhatsAppTemplateSendComponent[] = [];

  if (header > 0) {
    components.push({
      type: 'header',
      parameters: headerValues.map((text) => ({ type: 'text' as const, text: text.trim() })),
    });
  }

  if (body > 0) {
    components.push({
      type: 'body',
      parameters: bodyValues.map((text) => ({ type: 'text' as const, text: text.trim() })),
    });
  }

  return components;
}
