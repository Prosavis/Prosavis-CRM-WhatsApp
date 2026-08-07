import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { ConversationHistoryMeta } from '../../../supabase/functions/_shared/conversationHistory';
import type { InboxAiPropertySummary } from '../../../supabase/functions/_shared/inboxAiContextFormat';
import type { MetaSessionWindow } from '../../../supabase/functions/_shared/metaSessionWindow';
import {
  formatHistoryMetaSummary,
  formatPropertySummaryLabel,
  formatSessionWindowLabel,
  hasInboxAiUsedContext,
} from '@/utils/inboxAiUsedContext';

export interface UsedContextAccordionProps {
  historyMeta?: ConversationHistoryMeta | null;
  conversationTags?: string[] | null;
  propertySummary?: InboxAiPropertySummary | null;
  sessionWindow?: MetaSessionWindow | null;
  dense?: boolean;
  defaultExpanded?: boolean;
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontWeight: 600, letterSpacing: 0.2 }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function UsedContextAccordion({
  historyMeta,
  conversationTags,
  propertySummary,
  sessionWindow,
  dense = false,
  defaultExpanded = false,
}: UsedContextAccordionProps) {
  if (
    !hasInboxAiUsedContext({
      historyMeta,
      conversationTags,
      propertySummary,
      sessionWindow,
    })
  ) {
    return null;
  }

  const tags = conversationTags?.filter((t) => t.trim()) ?? [];

  return (
    <Accordion
      disableGutters
      elevation={0}
      defaultExpanded={defaultExpanded}
      sx={{
        bgcolor: 'transparent',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        '&:before': { display: 'none' },
        mx: dense ? 0 : 0,
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
        sx={{
          minHeight: dense ? 36 : 44,
          px: 1.25,
          '& .MuiAccordionSummary-content': { my: dense ? 0.5 : 1 },
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
          Contexto usado
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.25, pt: 0, pb: 1.25 }}>
        <ContextRow label="Historial" value={formatHistoryMetaSummary(historyMeta)} />
        <Box sx={{ mb: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 600, letterSpacing: 0.2 }}
          >
            Tags
          </Typography>
          {tags.length === 0 ? (
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              Sin tags
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" />
              ))}
            </Box>
          )}
        </Box>
        <ContextRow
          label="Propiedad"
          value={formatPropertySummaryLabel(propertySummary)}
        />
        <ContextRow
          label="Ventana de sesión"
          value={formatSessionWindowLabel(sessionWindow)}
        />
      </AccordionDetails>
    </Accordion>
  );
}
