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
  formatAppointmentsContextSummary,
  formatHistoryMetaSummary,
  formatPropertySummaryLabel,
  formatSessionWindowLabel,
  hasInboxAiUsedContext,
} from '@/utils/inboxAiUsedContext';
import type { InboxAiAppointment } from '../../../supabase/functions/_shared/inboxAiContextFormat';

export interface UsedContextAccordionProps {
  historyMeta?: ConversationHistoryMeta | null;
  conversationTags?: string[] | null;
  propertySummary?: InboxAiPropertySummary | null;
  sessionWindow?: MetaSessionWindow | null;
  appointments?: InboxAiAppointment[] | null;
  appointmentsLoadFailed?: boolean;
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
  appointments = null,
  appointmentsLoadFailed = false,
  dense = false,
  defaultExpanded = false,
}: UsedContextAccordionProps) {
  if (
    !hasInboxAiUsedContext({
      historyMeta,
      conversationTags,
      propertySummary,
      sessionWindow,
      appointments,
      appointmentsLoadFailed,
    })
  ) {
    return null;
  }

  const tags = conversationTags?.filter((t) => t.trim()) ?? [];
  const appointmentSummary = formatAppointmentsContextSummary(
    appointments,
    appointmentsLoadFailed,
  );
  const hasAppointmentRows =
    appointmentSummary.upcomingLines.length > 0 || appointmentSummary.pastLines.length > 0;

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
        <Box sx={{ mb: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 600, letterSpacing: 0.2 }}
          >
            Agendamientos
          </Typography>
          {!hasAppointmentRows ? (
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              {appointmentSummary.emptyLabel}
            </Typography>
          ) : (
            <>
              {appointmentSummary.upcomingLines.length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Próximos
                  </Typography>
                  {appointmentSummary.upcomingLines.map((line) => (
                    <Typography key={`up-${line}`} variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {line}
                    </Typography>
                  ))}
                </Box>
              )}
              {appointmentSummary.pastLines.length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Recientes
                  </Typography>
                  {appointmentSummary.pastLines.map((line) => (
                    <Typography key={`past-${line}`} variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {line}
                    </Typography>
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>
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
