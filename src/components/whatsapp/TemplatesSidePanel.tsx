import React, { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TemplateLibrary from '@/components/whatsapp/templates/TemplateLibrary';
import {
  getWhatsAppBookingContext,
  type BookingContextData,
  type WhatsAppSnippet,
} from '@/services/whatsappService';
import type { WhatsAppTemplateSuggestionContext } from '@/utils/whatsappTemplateSuggestions';
import type { MetaSessionWindow } from '../../../supabase/functions/_shared/metaSessionWindow';
import { useMetaSessionWindow } from '@/hooks/useMetaSessionWindow';

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
  compact?: boolean;
  onClose?: () => void;
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
  compact = false,
  onClose,
}) => {
  const [bookingContext, setBookingContext] = useState<BookingContextData | null>(null);
  const [sessionWindow, setSessionWindow] = useState<MetaSessionWindow | null>(null);
  const effectiveSessionWindow = useMetaSessionWindow(sessionWindow, lastInboundAt);

  useEffect(() => {
    if (!conversationStableKey) {
      setBookingContext(null);
      setSessionWindow(null);
      return;
    }

    let cancelled = false;
    void getWhatsAppBookingContext(conversationStableKey, false)
      .then((result) => {
        if (!cancelled) {
          setBookingContext(result.bookingContext ?? null);
          setSessionWindow(result.sessionWindow);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBookingContext(null);
          setSessionWindow(null);
        }
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
      sessionWindow: effectiveSessionWindow,
    };
  }, [
    bookingContext,
    conversationDisplayName,
    lastInboundAt,
    lastMessageDirection,
    effectiveSessionWindow,
  ]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {compact && onClose ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 56,
            px: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <IconButton
            aria-label="Cerrar plantillas"
            onClick={onClose}
            sx={{ width: 44, height: 44 }}
          >
            <CloseIcon />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={700}>
            Plantillas
          </Typography>
        </Box>
      ) : null}
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
        compact={compact}
      />
    </Box>
  );
};

export default TemplatesSidePanel;
