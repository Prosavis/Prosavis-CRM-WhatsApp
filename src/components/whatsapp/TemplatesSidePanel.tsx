import React, { useEffect, useMemo, useState } from 'react';
import TemplateLibrary from '@/components/whatsapp/templates/TemplateLibrary';
import {
  getWhatsAppBookingContext,
  type BookingContextData,
  type WhatsAppSnippet,
} from '@/services/whatsappService';
import type { WhatsAppTemplateSuggestionContext } from '@/utils/whatsappTemplateSuggestions';

interface TemplatesSidePanelProps {
  wabaId: string;
  phoneNumberId: string;
  recipientPhone: string;
  onApplyDraftToComposer?: (text: string) => void;
  snippets?: WhatsAppSnippet[];
  onSnippetsChanged?: () => void;
  conversationStableKey?: string;
  conversationDisplayName?: string;
  lastInboundAt?: Date | null;
  lastMessageDirection?: 'inbound' | 'outbound';
}

const TemplatesSidePanel: React.FC<TemplatesSidePanelProps> = ({
  wabaId,
  phoneNumberId,
  recipientPhone,
  onApplyDraftToComposer,
  snippets = [],
  onSnippetsChanged,
  conversationStableKey,
  conversationDisplayName,
  lastInboundAt = null,
  lastMessageDirection,
}) => {
  const [bookingContext, setBookingContext] = useState<BookingContextData | null>(null);

  useEffect(() => {
    if (!conversationStableKey) {
      setBookingContext(null);
      return;
    }

    let cancelled = false;
    void getWhatsAppBookingContext(conversationStableKey, false)
      .then((result) => {
        if (!cancelled) setBookingContext(result.bookingContext ?? null);
      })
      .catch(() => {
        if (!cancelled) setBookingContext(null);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationStableKey]);

  const suggestionContext = useMemo<WhatsAppTemplateSuggestionContext | undefined>(() => {
    if (!bookingContext) return undefined;
    return {
      bookingContext,
      conversationDisplayName,
      lastInboundAt,
      lastMessageDirection,
    };
  }, [bookingContext, conversationDisplayName, lastInboundAt, lastMessageDirection]);

  return (
    <TemplateLibrary
      mode="inbox"
      wabaId={wabaId}
      phoneNumberId={phoneNumberId}
      recipientPhone={recipientPhone}
      onApplyDraft={onApplyDraftToComposer}
      snippets={snippets}
      onSnippetsChanged={onSnippetsChanged}
      suggestionContext={suggestionContext}
      bookingContext={bookingContext ?? undefined}
    />
  );
};

export default TemplatesSidePanel;
