import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import { useSearchParams } from 'react-router-dom';
import { useReminderAutomationsDashboard } from '@/hooks/useReminderAutomationsDashboard';
import { DesignTokens } from '@/constants/designSystem';
import ReminderSummaryHeader from './ReminderSummaryHeader';
import ReminderRecipientPanel from './ReminderRecipientPanel';
import ReminderHistoryPanel from './ReminderHistoryPanel';
import ReactivationPanel from './ReactivationPanel';
import ReactivationHistoryPanel from './ReactivationHistoryPanel';
import PostServicePanel from './PostServicePanel';
import PostServiceHistoryPanel from './PostServiceHistoryPanel';
import AppRulesPanel from './AppRulesPanel';
import WhatsAppFamilyPicker from './WhatsAppFamilyPicker';
import FamilyViewTabs from './FamilyViewTabs';
import {
  ALL_WA_SUBTABS,
  familyFromAuto,
  getFamily,
  type AutoSubTab,
  type WaFamily,
} from './automationFamilies';

type AutomationsLayer = 'whatsapp' | 'app';

function parseLayer(value: string | null, auto: string | null): AutomationsLayer {
  if (value === 'app' || value === 'whatsapp') return value;
  if (auto === 'rules') return 'app';
  return 'whatsapp';
}

function parseAutoParam(
  value: string | null,
  layer: AutomationsLayer,
): AutoSubTab {
  if (layer === 'app') return 'rules';
  if (value && ALL_WA_SUBTABS.includes(value as AutoSubTab)) {
    return value as AutoSubTab;
  }
  return 'clients';
}

const AutomationsTab: React.FC = () => {
  const { data, isLoading, isFetching, error, refetch } =
    useReminderAutomationsDashboard();
  const [searchParams, setSearchParams] = useSearchParams();

  const autoParam = searchParams.get('auto');
  const layerParam = searchParams.get('layer');
  const layer = useMemo(
    () => parseLayer(layerParam, autoParam),
    [layerParam, autoParam],
  );
  const subTabKey = useMemo(
    () => parseAutoParam(autoParam, layer),
    [autoParam, layer],
  );
  const familyId = useMemo(
    () => familyFromAuto(subTabKey),
    [subTabKey],
  );
  const family = getFamily(familyId);

  const setLayer = useCallback(
    (next: AutomationsLayer) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', 'automations');
          if (next === 'whatsapp') {
            params.delete('layer');
            if (params.get('auto') === 'rules') params.delete('auto');
          } else {
            params.set('layer', 'app');
            params.set('auto', 'rules');
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setSubTab = useCallback(
    (next: AutoSubTab) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', 'automations');
          if (next === 'rules') {
            params.set('layer', 'app');
            params.set('auto', 'rules');
            return params;
          }
          params.delete('layer');
          if (next === 'clients') params.delete('auto');
          else params.set('auto', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setFamily = useCallback(
    (next: WaFamily) => {
      if (next === familyId) return;
      setSubTab(getFamily(next).defaultView);
    },
    [familyId, setSubTab],
  );

  useEffect(() => {
    if (layer === 'whatsapp' && autoParam === 'rules') {
      setSubTab('clients');
      return;
    }
    if (
      layer === 'whatsapp' &&
      autoParam &&
      !ALL_WA_SUBTABS.includes(autoParam as AutoSubTab) &&
      autoParam !== 'rules'
    ) {
      setSubTab('clients');
    }
  }, [autoParam, layer, setSubTab]);

  const showReminderHeader =
    layer === 'whatsapp' && familyId === 'reminders';

  const renderWhatsAppSubTab = () => {
    switch (subTabKey) {
      case 'clients':
        return data ? (
          <ReminderRecipientPanel
            recipientType="client"
            upcoming={data.clients.upcoming}
            lastRun={data.clients.lastRun}
            onRefresh={() => void refetch()}
          />
        ) : null;
      case 'cleaners':
        return data ? (
          <ReminderRecipientPanel
            recipientType="professional"
            upcoming={data.professionals.upcoming}
            lastRun={data.professionals.lastRun}
            onRefresh={() => void refetch()}
          />
        ) : null;
      case 'history':
        return <ReminderHistoryPanel />;
      case 'reactivations':
        return (
          <ReactivationPanel onOpenHistory={() => setSubTab('react-history')} />
        );
      case 'react-history':
        return <ReactivationHistoryPanel />;
      case 'post-service':
        return (
          <PostServicePanel
            onOpenHistory={() => setSubTab('post-service-history')}
          />
        );
      case 'post-service-history':
        return <PostServiceHistoryPanel />;
      case 'rules':
        return null;
      default: {
        const exhaustiveCheck: never = subTabKey;
        return exhaustiveCheck;
      }
    }
  };

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 2,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{
              color: DesignTokens.brand.primary.orange,
              fontWeight: 800,
              letterSpacing: '0.1em',
            }}
          >
            Operaciones
          </Typography>
          <Typography
            variant="h5"
            fontWeight={800}
            sx={{ letterSpacing: '-0.02em', lineHeight: 1.2 }}
          >
            Automatizaciones
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Pipelines WhatsApp y reglas de la app, en un solo lugar.
          </Typography>
        </Box>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={layer}
          onChange={(_, next: AutomationsLayer | null) => {
            if (next) setLayer(next);
          }}
          sx={{
            bgcolor: 'action.hover',
            borderRadius: 2,
            p: 0.35,
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 700,
              px: 1.75,
              py: 0.75,
              border: 0,
              borderRadius: '10px !important',
              gap: 0.75,
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: 'background.paper',
                color: 'text.primary',
                boxShadow: DesignTokens.shadows.sm,
              },
            },
          }}
        >
          <ToggleButton value="whatsapp">
            <ChatOutlinedIcon sx={{ fontSize: 18 }} />
            WhatsApp
          </ToggleButton>
          <ToggleButton value="app">
            <SmartphoneOutlinedIcon sx={{ fontSize: 18 }} />
            App
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {layer === 'app' ? (
        <AppRulesPanel />
      ) : (
        <>
          <WhatsAppFamilyPicker value={familyId} onChange={setFamily} />

          <Box
            sx={{
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              p: { xs: 1.5, sm: 2 },
              borderLeft: `4px solid ${family.accent}`,
            }}
          >
            <FamilyViewTabs
              family={family}
              value={subTabKey}
              onChange={setSubTab}
            />

            {showReminderHeader && (
              <ReminderSummaryHeader
                dashboard={data}
                loading={isLoading || isFetching}
                onRefresh={() => void refetch()}
              />
            )}

            {error && showReminderHeader && (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                action={
                  <Button size="small" onClick={() => void refetch()}>
                    Reintentar
                  </Button>
                }
              >
                <AlertTitle>Error al cargar</AlertTitle>
                {error.message}
              </Alert>
            )}

            {renderWhatsAppSubTab()}
          </Box>
        </>
      )}
    </Box>
  );
};

export default AutomationsTab;
