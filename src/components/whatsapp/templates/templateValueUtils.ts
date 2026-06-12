import type { WhatsAppTemplatePreset, WhatsAppTemplateSummary } from '@/services/whatsappService';
import {
  countSlotsForTemplate,
  getExampleValues,
} from '@/utils/whatsappTemplateHelpers';
import type { TemplateVariableValues } from './templateLibraryTypes';

export function buildInitialTemplateValues(
  template: WhatsAppTemplateSummary,
  options?: {
    preset?: WhatsAppTemplatePreset | null;
    suggestion?: { headerValues: string[]; bodyValues: string[] } | null;
  },
): TemplateVariableValues {
  const { header, body } = countSlotsForTemplate(template);
  const headerExamples = getExampleValues(template.components, 'HEADER');
  const bodyExamples = getExampleValues(template.components, 'BODY');

  const headerValues = Array.from({ length: header }, (_, index) => {
    const presetValue = options?.preset?.headerValues[index];
    if (presetValue?.trim()) return presetValue;
    const suggestionValue = options?.suggestion?.headerValues[index];
    if (suggestionValue?.trim()) return suggestionValue;
    return headerExamples[index] ?? '';
  });

  const bodyValues = Array.from({ length: body }, (_, index) => {
    const presetValue = options?.preset?.bodyValues[index];
    if (presetValue?.trim()) return presetValue;
    const suggestionValue = options?.suggestion?.bodyValues[index];
    if (suggestionValue?.trim()) return suggestionValue;
    return bodyExamples[index] ?? '';
  });

  return { header: headerValues, body: bodyValues };
}
