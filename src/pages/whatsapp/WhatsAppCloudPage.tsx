import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  LocalOffer as LocalOfferIcon,
  Refresh as RefreshIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import ChatArea from '@/components/whatsapp/ChatArea';
import ConversationList from '@/components/whatsapp/ConversationList';
import MetricsPanel from '@/components/whatsapp/MetricsPanel';
import TagManagerDialog from '@/components/whatsapp/TagManagerDialog';
import { WHATSAPP_CRM_PHONE_NUMBER_ID } from '@/constants/whatsapp';
import {
  createWhatsAppTag,
  getWhatsAppMetrics,
  listWhatsAppTags,
  markWhatsAppAsRead,
  sendWhatsAppChatMessage,
  subscribeToConversations,
  subscribeToMessages,
} from '@/services/whatsappService';
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppMetrics,
  WhatsAppTag,
} from '@/types/whatsapp';

export default function WhatsAppCloudPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedStableKey, setSelectedStableKey] = useState<string>();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [tags, setTags] = useState<WhatsAppTag[]>([]);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [metrics, setMetrics] = useState<WhatsAppMetrics>();
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string>();
  const [days, setDays] = useState(30);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.stableKey === selectedStableKey,
      ),
    [conversations, selectedStableKey],
  );

  const loadTags = useCallback(async () => {
    try {
      setTags(await listWhatsAppTags());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudieron cargar tags.',
      );
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(undefined);
    try {
      setMetrics(await getWhatsAppMetrics(days));
    } catch (error) {
      setMetricsError(
        error instanceof Error ? error.message : 'No se pudieron cargar metricas.',
      );
    } finally {
      setMetricsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const unsubscribe = subscribeToConversations(
      (nextConversations) => {
        setConversations(nextConversations);
        setInboxError(null);
        setSelectedStableKey((current) => {
          if (current) return current;
          return nextConversations[0]?.stableKey;
        });
      },
      WHATSAPP_CRM_PHONE_NUMBER_ID,
      (error) => setInboxError(error.message),
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTags();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTags]);

  useEffect(() => {
    if (activeTab !== 1) return;

    const timeoutId = window.setTimeout(() => {
      void loadMetrics();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadMetrics]);

  useEffect(() => {
    if (!selectedStableKey) {
      const timeoutId = window.setTimeout(() => {
        setMessages([]);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      setMessagesLoading(true);
    }, 0);
    const unsubscribe = subscribeToMessages(
      selectedStableKey,
      (nextMessages) => {
        setMessages(nextMessages);
        setMessagesLoading(false);
      },
      (error) => {
        setInboxError(error.message);
        setMessagesLoading(false);
      },
    );

    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [selectedStableKey]);

  const handleSend = async (messageBody: string) => {
    if (!selectedConversation) return;

    await sendWhatsAppChatMessage({
      conversationStableKey: selectedConversation.stableKey,
      messageBody,
      recipientPhone: selectedConversation.phone ?? selectedConversation.contactPhone,
      phoneNumberId: selectedConversation.phoneNumberId ?? WHATSAPP_CRM_PHONE_NUMBER_ID,
    });
  };

  const handleMarkRead = async () => {
    if (!selectedConversation) return;
    await markWhatsAppAsRead(selectedConversation.stableKey);
  };

  const handleCreateTag = async (name: string, color: string) => {
    await createWhatsAppTag({ name, color });
    await loadTags();
  };

  const unreadTotal = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );

  return (
    <Stack spacing={2.5}>
      <Card
        sx={{
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, rgba(7,94,84,0.98), rgba(0,168,132,0.9))',
          color: '#fff',
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ justifyContent: 'space-between' }}
          >
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                <WhatsAppIcon />
                <Typography variant="overline" sx={{ letterSpacing: 2 }}>
                  Fase 1 Supabase
                </Typography>
              </Stack>
              <Typography variant="h4">WhatsApp Cloud CRM</Typography>
              <Typography sx={{ opacity: 0.86, maxWidth: 720 }}>
                Inbox y metricas separados del Panel. No usa Firebase, Firestore,
                Functions ni Storage del ecosistema actual.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Chip label={`${conversations.length} conversaciones`} />
              <Chip label={`${unreadTotal} sin leer`} color="secondary" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{
            alignItems: { xs: 'stretch', md: 'center' },
            justifyContent: 'space-between',
            px: 2,
            pt: 1,
          }}
        >
          <Tabs value={activeTab} onChange={(_event, value) => setActiveTab(value)}>
            <Tab icon={<WhatsAppIcon />} iconPosition="start" label="Inbox" />
            <Tab icon={<BarChartIcon />} iconPosition="start" label="Metricas" />
          </Tabs>
          <Stack direction="row" spacing={1} sx={{ p: 1 }}>
            <Button
              variant="outlined"
              startIcon={<LocalOfferIcon />}
              onClick={() => setTagDialogOpen(true)}
            >
              Tags
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => {
                void loadTags();
                if (activeTab === 1) void loadMetrics();
              }}
            >
              Refrescar
            </Button>
          </Stack>
        </Stack>
        <Divider />

        {activeTab === 0 ? (
          <Box
            sx={{
              height: { xs: 'auto', md: '68vh' },
              minHeight: 580,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '380px 1fr' },
            }}
          >
            <Box sx={{ borderRight: { md: '1px solid rgba(7, 94, 84, 0.1)' } }}>
              {inboxError && (
                <Alert severity="error" sx={{ m: 2 }}>
                  {inboxError}
                </Alert>
              )}
              <ConversationList
                conversations={conversations}
                tags={tags}
                selectedStableKey={selectedStableKey}
                onSelect={(conversation) => setSelectedStableKey(conversation.stableKey)}
              />
            </Box>
            <ChatArea
              conversation={selectedConversation}
              messages={messages}
              loading={messagesLoading}
              onSend={handleSend}
              onMarkRead={handleMarkRead}
            />
          </Box>
        ) : (
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            <MetricsPanel
              metrics={metrics}
              loading={metricsLoading}
              error={metricsError}
              days={days}
              onDaysChange={setDays}
            />
          </Box>
        )}
      </Card>

      <TagManagerDialog
        open={tagDialogOpen}
        tags={tags}
        onClose={() => setTagDialogOpen(false)}
        onCreate={handleCreateTag}
      />
    </Stack>
  );
}
