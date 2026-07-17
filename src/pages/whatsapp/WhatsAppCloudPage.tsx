import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminTour } from '@/context/AdminTourContext';
import { Box, CircularProgress, Alert, Button } from '@mui/material';
import WhatsAppLayout from '@/components/whatsapp/WhatsAppLayout';
import WhatsAppTopBar from '@/components/whatsapp/WhatsAppTopBar';
import WhatsAppDirectoryContactsDialog from '@/components/whatsapp/WhatsAppDirectoryContactsDialog';
import WhatsAppBulkSendDialog from '@/components/whatsapp/bulk/WhatsAppBulkSendDialog';
import MetricsTab, {
  PURGE_WHATSAPP_LOG_CONFIRM_PHRASE,
} from '@/components/whatsapp/metrics/MetricsTab';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';
import useSoundEffects from '@/hooks/useSoundEffects';
import { ensureWhatsAppConversationFromLead } from '@/services/whatsappService';
import { directoryService } from '@/services/directoryService';
import type { WhatsAppInboxMetrics } from '@/utils/whatsappInboxStats';
import {
  WHATSAPP_FOCUS_CHAT_EVENT,
  dismissDesktopNotificationsOnboarding,
  getNotificationPermission,
  isDesktopNotificationsOnboardingDismissed,
  isNotificationSupported,
  type WhatsAppFocusChatDetail,
} from '@/utils/desktopNotifications';

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
  const tabParam = searchParams.get('tab');
  const broadcastJobParam = searchParams.get('broadcastJob');
  const activeTab =
    tabParam === 'metrics'
      ? 1
      : tabParam === 'leads'
        ? 2
        : tabParam === 'discounts'
          ? 3
          : tabParam === 'settings'
            ? 4
            : tabParam === 'monitoreo'
              ? 5
              : tabParam === 'automations'
                ? 6
                : 0;

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

  const handleMainTabChange = (_: React.SyntheticEvent, value: number) => {
    playNavigation();
    const next = new URLSearchParams(searchParams);
    if (value === 0) next.delete('tab');
    else if (value === 1) next.set('tab', 'metrics');
    else if (value === 2) next.set('tab', 'leads');
    else if (value === 3) next.set('tab', 'discounts');
    else if (value === 4) next.set('tab', 'settings');
    else if (value === 5) next.set('tab', 'monitoreo');
    else next.set('tab', 'automations');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const tabLabels = ['', 'metrics', 'leads', 'discounts', 'settings', 'monitoreo', 'automations'] as const;
    registerTabController('/whatsapp-cloud', {
      setTab: (index: number) => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (index === 0) next.delete('tab');
            else next.set('tab', tabLabels[index] || 'metrics');
            return next;
          },
          { replace: true },
        );
      },
      getTab: () => activeTab,
    });
    return () => unregisterTabController('/whatsapp-cloud');
  }, [registerTabController, unregisterTabController, activeTab, setSearchParams]);

  const [inboxTotalContacts, setInboxTotalContacts] = useState<number | null>(null);
  const [directoryTotalContacts, setDirectoryTotalContacts] = useState<number | null>(null);
  const [directoryDialogOpen, setDirectoryDialogOpen] = useState(false);
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
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.set('focusPhone', phone);
    next.set('conversation', conversationId || phone.replace(/\D/g, '') || phone);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleClearFocusPhone = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('focusPhone');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleClearFocusConversation = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('conversation');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleClearFocusDeepLink = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    const hadFocus = next.has('focusPhone') || next.has('conversation');
    if (!hadFocus) return;
    next.delete('focusPhone');
    next.delete('conversation');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleFocusChatFromNotification = useCallback(
    (phone: string) => {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      next.set('focusPhone', phone);
      next.set('conversation', phone.replace(/\D/g, '') || phone);
      setSearchParams(next, { replace: true });
      window.focus();
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WhatsAppFocusChatDetail>).detail;
      if (!detail?.phone) return;
      handleFocusChatFromNotification(detail.phone);
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
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'settings');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, handleDismissNotificationsOnboarding]);

  const handleInboxMetrics = useCallback((metrics: WhatsAppInboxMetrics) => {
    setInboxTotalContacts(metrics.totalConversations);
  }, []);

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
        inboxTotalContacts={inboxTotalContacts}
        directoryTotalContacts={directoryTotalContacts}
        onOpenDirectory={() => setDirectoryDialogOpen(true)}
        onOpenBulk={() => setBulkOpen(true)}
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
          data-tour="whatsapp-tab-inbox"
          sx={{ display: activeTab === 0 ? 'block' : 'none' }}
        >
          <WhatsAppLayout
            phoneNumberId={phoneNumberId}
            wabaId={wabaId}
            focusPhone={focusPhone}
            onClearFocusPhone={handleClearFocusPhone}
            focusConversation={focusConversation}
            onClearFocusConversation={handleClearFocusConversation}
            onClearFocusDeepLink={handleClearFocusDeepLink}
            onInboxMetrics={handleInboxMetrics}
          />
        </Box>

        {activeTab === 1 && (
          <MetricsTab
            broadcastJobParam={broadcastJobParam}
            onClearBroadcastJobParam={clearBroadcastJobParam}
          />
        )}

        {activeTab === 2 && (
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

        {activeTab === 3 && (
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

        {activeTab === 4 && (
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

        {activeTab === 5 && (
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

        {activeTab === 6 && (
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
              const next = new URLSearchParams(prev);
              next.set('tab', 'metrics');
              next.set('broadcastJob', jobId);
              return next;
            },
            { replace: true },
          );
        }}
      />

      <WhatsAppDirectoryContactsDialog
        open={directoryDialogOpen}
        onClose={() => setDirectoryDialogOpen(false)}
        onOpenInInbox={handleOpenLeadInInbox}
      />
    </>
  );
};

export default WhatsAppCloudPage;
