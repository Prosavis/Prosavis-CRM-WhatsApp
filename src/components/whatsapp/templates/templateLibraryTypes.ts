import type {
  BookingContextData,
  WhatsAppSnippet,
  WhatsAppTemplatePreset,
  WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import type { WhatsAppTemplatePanelSection } from '@/constants/whatsappTemplateSections';
import type { WhatsAppTemplateSuggestionContext } from '@/utils/whatsappTemplateSuggestions';

export type TemplateLibraryMode = 'inbox' | 'bulk' | 'booking';

export type TemplateLibraryTab = 'favorites' | 'meta' | 'prosavis' | 'crm';

export type MetaCategoryFilter = 'ALL' | 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export interface TemplateVariableValues {
  header: string[];
  body: string[];
}

export interface TemplateLibraryBaseProps {
  wabaId: string;
  snippets?: WhatsAppSnippet[];
  onSnippetsChanged?: () => void;
  suggestionContext?: WhatsAppTemplateSuggestionContext;
  bookingContext?: BookingContextData;
  compact?: boolean;
}

export interface TemplateLibraryInboxProps extends TemplateLibraryBaseProps {
  mode: 'inbox';
  phoneNumberId: string;
  recipientPhone: string;
  onApplyDraft?: (text: string) => void;
}

export interface TemplateLibraryBulkProps extends TemplateLibraryBaseProps {
  mode: 'bulk';
  selectedTemplate: WhatsAppTemplateSummary | null;
  values: TemplateVariableValues;
  onSelect: (
    template: WhatsAppTemplateSummary | null,
    values: TemplateVariableValues,
  ) => void;
}

export interface TemplateLibraryBookingProps extends TemplateLibraryBaseProps {
  mode: 'booking';
  phoneNumberId?: string;
  recipientPhone?: string;
  onApplyDraft?: (text: string) => void;
  initialTemplate?: WhatsAppTemplateSummary | null;
  initialValues?: TemplateVariableValues;
  suggestionReason?: string | null;
}

export type TemplateLibraryProps =
  | TemplateLibraryInboxProps
  | TemplateLibraryBulkProps
  | TemplateLibraryBookingProps;

export interface GroupedMetaTemplates {
  key: string;
  label: string;
  description?: string;
  templates: WhatsAppTemplateSummary[];
}

export interface TemplateLibraryData {
  templates: WhatsAppTemplateSummary[];
  presets: WhatsAppTemplatePreset[];
  snippets: WhatsAppSnippet[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reloadPresets: () => Promise<void>;
}

export type { WhatsAppTemplatePanelSection };
