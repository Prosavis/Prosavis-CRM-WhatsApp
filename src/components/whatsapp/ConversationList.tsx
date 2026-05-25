import {
  Avatar,
  Badge,
  Box,
  Chip,
  List,
  ListItemButton,
  Stack,
  Typography,
} from '@mui/material';
import { PushPin as PushPinIcon } from '@mui/icons-material';
import type { WhatsAppConversation, WhatsAppTag } from '@/types/whatsapp';
import { formatRelativeTime } from '@/utils/date';

interface ConversationListProps {
  conversations: WhatsAppConversation[];
  tags: WhatsAppTag[];
  selectedStableKey?: string;
  onSelect: (conversation: WhatsAppConversation) => void;
}

export default function ConversationList({
  conversations,
  tags,
  selectedStableKey,
  onSelect,
}: ConversationListProps) {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <List disablePadding>
        {conversations.map((conversation) => {
          const selected = selectedStableKey === conversation.stableKey;
          const title =
            conversation.contactName ||
            conversation.whatsappProfileName ||
            conversation.phone ||
            conversation.stableKey;

          return (
            <ListItemButton
              key={conversation.id}
              selected={selected}
              onClick={() => onSelect(conversation)}
              sx={{
                alignItems: 'flex-start',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderBottom: '1px solid rgba(7, 94, 84, 0.08)',
              }}
            >
              <Badge
                color="secondary"
                badgeContent={conversation.unreadCount || 0}
                invisible={!conversation.unreadCount}
              >
                <Avatar src={conversation.contactPhotoUrl}>
                  {title.slice(0, 1).toUpperCase()}
                </Avatar>
              </Badge>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                  <Typography noWrap sx={{ fontWeight: 800 }}>
                    {title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatRelativeTime(conversation.lastMessageAt)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {conversation.lastMessageText || 'Sin mensajes todavia'}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {conversation.isPinned && (
                    <Chip
                      size="small"
                      icon={<PushPinIcon />}
                      label="Fijado"
                      variant="outlined"
                    />
                  )}
                  {conversation.tagIds.slice(0, 2).map((tagId) => {
                    const tag = tagsById.get(tagId);
                    if (!tag) return null;
                    return (
                      <Chip
                        key={tag.id}
                        size="small"
                        label={tag.name}
                        sx={{
                          bgcolor: tag.color ?? '#e8f5e9',
                          color: '#13201d',
                        }}
                      />
                    );
                  })}
                </Stack>
              </Box>
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
