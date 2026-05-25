import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import {
  DoneAll as DoneAllIcon,
  MarkEmailRead as MarkEmailReadIcon,
} from '@mui/icons-material';
import MessageInput from '@/components/whatsapp/MessageInput';
import type { WhatsAppConversation, WhatsAppMessage } from '@/types/whatsapp';
import { formatShortDateTime } from '@/utils/date';

interface ChatAreaProps {
  conversation?: WhatsAppConversation;
  messages: WhatsAppMessage[];
  loading: boolean;
  onSend: (message: string) => Promise<void>;
  onMarkRead: () => Promise<void>;
}

function statusIcon(status: string) {
  if (status === 'read') return <DoneAllIcon fontSize="small" color="success" />;
  if (status === 'delivered') return <DoneAllIcon fontSize="small" />;
  return null;
}

export default function ChatArea({
  conversation,
  messages,
  loading,
  onSend,
  onMarkRead,
}: ChatAreaProps) {
  if (!conversation) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 4 }}>
        <Stack spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="h5">Selecciona una conversacion</Typography>
          <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
            El inbox se alimenta desde Supabase Realtime y no comparte estado con
            Firebase.
          </Typography>
        </Stack>
      </Box>
    );
  }

  const title =
    conversation.contactName ||
    conversation.whatsappProfileName ||
    conversation.phone ||
    conversation.stableKey;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          p: 2,
          borderBottom: '1px solid rgba(7, 94, 84, 0.1)',
        }}
      >
        <Box>
          <Typography variant="h6">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {conversation.contactPhone ?? conversation.phone ?? conversation.stableKey}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip label={conversation.state} color="primary" variant="outlined" />
          <Chip
            icon={<MarkEmailReadIcon />}
            label="Marcar leido"
            onClick={() => void onMarkRead()}
            clickable
          />
        </Stack>
      </Stack>

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          background:
            'linear-gradient(180deg, rgba(216, 243, 237, 0.35), rgba(255,255,255,0.7))',
        }}
      >
        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {messages.map((message) => {
              const outbound = message.direction === 'outbound';
              return (
                <Box
                  key={message.id}
                  sx={{
                    alignSelf: outbound ? 'flex-end' : 'flex-start',
                    maxWidth: '78%',
                    p: 1.5,
                    borderRadius: outbound
                      ? '20px 20px 4px 20px'
                      : '20px 20px 20px 4px',
                    bgcolor: outbound ? '#d8f3ed' : '#fff',
                    border: '1px solid rgba(7, 94, 84, 0.08)',
                  }}
                >
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                    {message.messageBody || message.caption || '[Adjunto]'}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', mt: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatShortDateTime(message.createdAt)}
                    </Typography>
                    {outbound && statusIcon(message.status)}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      <MessageInput onSend={onSend} />
    </Box>
  );
}
