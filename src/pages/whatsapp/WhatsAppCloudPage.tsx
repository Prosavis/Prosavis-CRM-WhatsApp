import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminTour } from '@/context/AdminTourContext';
import { Box, CircularProgress, Alert, Button } from '@mui/material';
import WhatsAppLayout from '@/components/whatsapp/WhatsAppLayout';
import WhatsAppTopBar from '@/components/whatsapp/WhatsAppTopBar';
import WhatsAppBulkSendDialog from '@/components/whatsapp/bulk/WhatsAppBulkSendDialog';
import MetricsTab, {
  PURGE_WHATSAPP_LOG_CONFIRM_PHRASE,
} from '@/components/whatsapp/metrics/MetricsTab';
import {
  WHATSAPP_CLOUD_COMMERCIAL,
  WHATSAPP_CLOUD_PRODUCTION,
} from '@/constants/whatsappCloudAccounts';
import useSoundEffects from '@/hooks/useSoundEffects';
import { ensureWhatsAppConversationFromLead } from '@/services/whatsappService';
import { directoryService } from '@/services/directoryService';
import {
  WHATSAPP_FOCUS_CHAT_EVENT,
  dismissDesktopNotificationsOnboarding,
  getNotificationPermission,
  isDesktopNotificationsOnboardingDismissed,
  isNotificationSupported,
  type WhatsAppFocusChatDetail,
} from '@/utils/desktopNotifications';
import {
  applyWhatsAppFocusChat,
  applyWhatsAppTab,
  normalizeWhatsAppSearchParams,
  resolveWhatsAppLineFilter,
  resolveWhatsAppTabKey,
  whatsappTabFromIndex,
  whatsappTabIndex,
  type WhatsAppTabKey,
} from '@/utils/whatsappTabs';

export { PURGE_WHATSAPP_LOG_CONFIRM_PHRASE };

const LeadsPage = lazy(() => import('../leads/LeadsPage'));
const DiscountCodesTab = lazy(() => import('@/components/whatsapp/DiscountCodesTab'));
const WhatsAppSettingsTab = lazy(() => import('@/components/whatsapp/WhatsAppSettingsTab'));
const MonitorTab = lazy(() => import('@/components/whatsapp/MonitorTab'));
const AutomationsPage = lazy(() => import('@/pages/automations/AutomationsPage'));

const { phoneNumberId, wabaId, phoneDisplay, botLabel } = WHATSAPP_CLOUD_PRODUCTION;

const WhatsAppCloudPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { playNavigation } = useSoundEffects();
  const { registerTabController, unregisterTabController } = useAdminTour();
  const activeTab = resolveWhatsAppTabKey(searchParams);
  const lineFilter = resolveWhatsAppLineFilter(searchParams);
  const broadcastJobParam = searchParams.get('broadcastJob');
  const isInboxSurface = activeTab === 'inbox' || activeTab === 'commercial';
  const inboxPhoneNumberId =
    lineFilter === 'commercial' ? WHATSAPP_CLOUD_COMMERCIAL.phoneNumberId : phoneNumberId;
  const inboxWabaId = lineFilter === 'commercial' ? WHATSAPP_CLOUD_COMMERCIAL.wabaId : wabaId;

  const clearBroadcastJobParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('broadcastJob');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleMainTabChange = (_: React.SyntheticEvent, value: WhatsAppTabKey) => {
    playNavigation();
    if (value !== 'inbox') setBulkOpen(false);
    setSearchParams(
      (prev) => {
        const next = applyWhatsAppTab(prev, value);
        if (value === 'inbox' || value === 'commercial') {
          next.delete('focusPhone');
          next.delete('conversation');
        }
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    const { next, changed } = normalizeWhatsAppSearchParams(searchParams);
    if (changed) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    registerTabController('/whatsapp-cloud', {
      setTab: (index: number) => {
        setSearchParams(
          (prev) => applyWhatsAppTab(prev, whatsappTabFromIndex(index)),
          { replace: true },
        );
      },
      getTab: () => whatsappTabIndex(activeTab),
    });
    return () => unregisterTabController('/whatsapp-cloud');
  }, [registerTabController, unregisterTabController, activeTab, setSearchParams]);

  const [directoryTotalContacts, setDirectoryTotalContacts] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showNotificationsOnboarding, setShowNotificationsOnboarding] = useState(
    () =>
      isNotificationSupported() &&
      getNotificationPermission() === 'default' &&
      !isDesktopNotificationsOnboardingDismissed(),
  );

  const focusPhone = searchParams.get('focusPhone') || undefined;
  const focusConversation = searchParams.get('conversation') || undefined;

  const handleOpenLeadInInbox = useCallback(async (phone: string, name?: string) => {
    let conversationId: string | undefined;
    try {
      const result = await ensureWhatsAppConversationFromLead({
        phone,
        name,
        phoneNumberId,
      });
      conversationId = result.conversationId;
    } catch (err) {
      console.error('Error ensuring conversation:', err);
    }
    setSearchParams(
      (prev) => {
        const next = applyWhatsAppTab(prev, 'inbox');
        next.set('focusPhone', phone);
        next.set('conversation', conversationId || phone.replace(/\D/g, '') || phone);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleClearFocusPhone = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('focusPhone');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleClearFocusConversation = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('conversation');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleClearFocusDeepLink = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const hadFocus = next.has('focusPhone') || next.has('conversation');
        if (!hadFocus) return prev;
        next.delete('focusPhone');
        next.delete('conversation');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleFocusChatFromNotification = useCallback(
    (detail: WhatsAppFocusChatDetail) => {
      setSearchParams(
        (prev) => applyWhatsAppFocusChat(prev, detail),
        { replace: true },
      );
      window.focus();
    },
    [setSearchParams],
  );

  const handleOpenConversation = useCallback((detail: WhatsAppFocusChatDetail) => {
    setSearchParams(
      (prev) => applyWhatsAppFocusChat(prev, detail),
      { replace: true },
    );
  }, [setSearchParams]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WhatsAppFocusChatDetail>).detail;
      if (!detail?.phone && !detail?.conversationId) return;
      handleFocusChatFromNotification(detail);
    };
    window.addEventListener(WHATSAPP_FOCUS_CHAT_EVENT, handler);
    return () => window.removeEventListener(WHATSAPP_FOCUS_CHAT_EVENT, handler);
  }, [handleFocusChatFromNotification]);

  const handleDismissNotificationsOnboarding = useCallback(() => {
    dismissDesktopNotificationsOnboarding();
    setShowNotificationsOnboarding(false);
  }, []);

  const handleGoToNotificationSettings = useCallback(() => {
    handleDismissNotificationsOnboarding();
    setSearchParams(
      (prev) => applyWhatsAppTab(prev, 'settings'),
      { replace: true },
    );
  }, [setSearchParams, handleDismissNotificationsOnboarding]);

  const fetchDirectoryStats = useCallback(async () => {
    try {
      const stats = await directoryService.getStats();
      setDirectoryTotalContacts(stats.total);
    } catch {
      // Fallback silencioso
    }
  }, []);

  useEffect(() => {
    void fetchDirectoryStats();
  }, [fetchDirectoryStats]);

  return (
    <>
      <WhatsAppTopBar
        activeTab={activeTab}
        onTabChange={handleMainTabChange}
        directoryTotalContacts={directoryTotalContacts}
        onOpenBulk={() => setBulkOpen(true)}
        showBulk={activeTab === 'inbox'}
      />

      {showNotificationsOnboarding && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={handleDismissNotificationsOnboarding}
          action={
            <Button color="inherit" size="small" onClick={handleGoToNotificationSettings}>
              Activar en Ajustes
            </Button>
          }
        >
          Activa las notificaciones de escritorio en Ajustes para escuchar alertas cuando el CRM esté en
          segundo plano.
        </Alert>
      )}

      <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
        <Box
          data-tour={activeTab === 'commercial' ? 'whatsapp-tab-commercial' : 'whatsapp-tab-inbox'}
          sx={{ display: isInboxSurface ? 'block' : 'none' }}
        >
          <WhatsAppLayout
            phoneNumberId={inboxPhoneNumberId}
            wabaId={inboxWabaId}
            lineFilter={lineFilter}
            onOpenConversation={handleOpenConversation}
            focusPhone={focusPhone}
            onClearFocusPhone={handleClearFocusPhone}
            focusConversation={focusConversation}
            onClearFocusConversation={handleClearFocusConversation}
            onClearFocusDeepLink={handleClearFocusDeepLink}
          />
        </Box>

        {activeTab === 'metrics' && (
          <MetricsTab
            broadcastJobParam={broadcastJobParam}
            onClearBroadcastJobParam={clearBroadcastJobParam}
          />
        )}

        {activeTab === 'leads' && (
          <div data-tour="whatsapp-tab-leads">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <LeadsPage embedded onOpenInInbox={handleOpenLeadInInbox} />
            </Suspense>
          </div>
        )}

        {activeTab === 'discounts' && (
          <div data-tour="whatsapp-tab-discounts">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <DiscountCodesTab />
            </Suspense>
          </div>
        )}

        {activeTab === 'settings' && (
          <div data-tour="whatsapp-tab-settings">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <WhatsAppSettingsTab phoneNumberId={phoneNumberId} />
            </Suspense>
          </div>
        )}

        {activeTab === 'monitoreo' && (
          <div data-tour="whatsapp-tab-monitoreo">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <MonitorTab />
            </Suspense>
          </div>
        )}

        {activeTab === 'automations' && (
          <div data-tour="whatsapp-tab-automations">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <AutomationsPage />
            </Suspense>
          </div>
        )}
      </Box>

      {activeTab === 'inbox' && (
        <WhatsAppBulkSendDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          wabaId={wabaId}
          phoneNumberId={phoneNumberId}
          botLabel={botLabel}
          phoneDisplay={phoneDisplay}
          onViewJobInMetrics={(jobId) => {
            setBulkOpen(false);
            setSearchParams(
              (prev) => {
                const next = applyWhatsAppTab(prev, 'metrics');
                next.set('broadcastJob', jobId);
                return next;
              },
              { replace: true },
            );
          }}
        />
      )}

    </>
  );
};

export default WhatsAppCloudPage;
