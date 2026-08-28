import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme as useMuiTheme, type Theme } from '@mui/material/styles';
import {
  Inbox as InboxIcon,
  Storefront as StorefrontIcon,
  BarChart as BarChartIcon,
  ContactPhone as ContactPhoneIcon,
  ConfirmationNumber as ConfirmationNumberIcon,
  Settings as SettingsIcon,
  MonitorHeart as MonitorHeartIcon,
  AutoAwesome as AutoAwesomeIcon,
  Send as SendIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import ThemeToggle from '@/components/common/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getProsavisLogoSrc } from '@/utils/prosavisBrand';
import { inboxLineNavMeta } from '@/utils/whatsappInboxNav';
import type { WhatsAppTabKey } from '@/utils/whatsappTabs';
import WhatsAppInternalContactsButton from './WhatsAppInternalContactsButton';

export interface WhatsAppTopBarProps {
  activeTab: WhatsAppTabKey;
  onTabChange: (_: React.SyntheticEvent, value: WhatsAppTabKey) => void;
  directoryTotalContacts: number | null;
  onOpenBulk: () => void;
  showBulk?: boolean;
}

function InboxLineTabLabel({
  title,
  phone,
  compact,
}: {
  title: string;
  phone: string;
  compact: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: compact ? 'center' : 'flex-start',
        lineHeight: 1.15,
        textAlign: compact ? 'center' : 'left',
      }}
    >
      <Box
        component="span"
        sx={{
          fontWeight: 800,
          fontSize: compact ? '0.68rem' : '0.8125rem',
          letterSpacing: 0.1,
        }}
      >
        {compact ? title.replace(/^Inbox\s+/i, '') : title}
      </Box>
      <Box
        component="span"
        sx={{
          mt: 0.25,
          fontSize: compact ? '0.62rem' : '0.7rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 0.2,
          opacity: 0.92,
        }}
      >
        {phone}
      </Box>
    </Box>
  );
}

function buildTabItems(directoryTotalContacts: number | null) {
  const directoryLabel =
    directoryTotalContacts != null
      ? `Directorio (${directoryTotalContacts.toLocaleString('es-CO')})`
      : 'Directorio';
  const bot = inboxLineNavMeta('bot');
  const commercial = inboxLineNavMeta('commercial');

  return [
    {
      key: 'inbox' as const,
      icon: <InboxIcon fontSize="small" />,
      label: bot.title,
      phone: bot.phone,
      ariaLabel: bot.ariaLabel,
      line: 'bot' as const,
    },
    {
      key: 'commercial' as const,
      icon: <StorefrontIcon fontSize="small" />,
      label: commercial.title,
      phone: commercial.phone,
      ariaLabel: commercial.ariaLabel,
      line: 'commercial' as const,
    },
    { key: 'metrics' as const, icon: <BarChartIcon fontSize="small" />, label: 'Métricas' },
    { key: 'leads' as const, icon: <ContactPhoneIcon fontSize="small" />, label: directoryLabel },
    { key: 'discounts' as const, icon: <ConfirmationNumberIcon fontSize="small" />, label: 'Descuentos' },
    { key: 'settings' as const, icon: <SettingsIcon fontSize="small" />, label: 'Configuración' },
    { key: 'monitoreo' as const, icon: <MonitorHeartIcon fontSize="small" />, label: 'Monitoreo' },
    { key: 'automations' as const, icon: <AutoAwesomeIcon fontSize="small" />, label: 'Automatizaciones' },
  ];
}

function inboxLineTabSx(line: 'bot' | 'commercial') {
  const isBot = line === 'bot';
  return {
    minHeight: 56,
    mx: 0.25,
    px: { xs: 1, sm: 1.35 },
    py: 0.6,
    mr: isBot ? 0.25 : 1.25,
    borderRadius: 2,
    border: 1,
    alignItems: 'center',
    fontWeight: 800,
    bgcolor: (theme: Theme) =>
      alpha(isBot ? theme.palette.primary.main : theme.palette.secondary.main, isBot ? 0.08 : 0.12),
    color: isBot ? 'primary.main' : 'secondary.dark',
    borderColor: (theme: Theme) =>
      alpha(isBot ? theme.palette.primary.main : theme.palette.secondary.main, isBot ? 0.38 : 0.5),
    '&.Mui-selected': {
      bgcolor: isBot ? 'primary.main' : 'secondary.main',
      color: isBot ? 'primary.contrastText' : 'secondary.contrastText',
      borderColor: isBot ? 'primary.main' : 'secondary.main',
    },
  };
}

const WhatsAppTopBar: React.FC<WhatsAppTopBarProps> = ({
  activeTab,
  onTabChange,
  directoryTotalContacts,
  onOpenBulk,
  showBulk = true,
}) => {
  const { mode } = useTheme();
  const { profile, signOut } = useAuth();
  const muiTheme = useMuiTheme();
  const compactTabs = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const tabItems = useMemo(
    () => buildTabItems(directoryTotalContacts),
    [directoryTotalContacts],
  );

  return (
    <Box
      component="header"
      data-tour="whatsapp-header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, md: 1.5 },
        mb: 1.5,
        px: { xs: 1, sm: 1.5 },
        py: 0.75,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        flexWrap: 'wrap',
      }}
    >
      <Box
        component="img"
        src={getProsavisLogoSrc(mode)}
        alt="Prosavis"
        sx={{
          width: 32,
          height: 32,
          objectFit: 'contain',
          flexShrink: 0,
        }}
      />

      <Tabs
        value={activeTab}
        onChange={onTabChange}
        data-tour="whatsapp-tabs"
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          flex: '1 1 280px',
          minWidth: 0,
          minHeight: 56,
          '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' },
          '& .MuiTab-root': {
            minHeight: 40,
            py: 0.5,
            px: { xs: 1, sm: 1.5 },
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8125rem',
          },
        }}
      >
        {tabItems.map((item) => {
          const isInboxLine = item.key === 'inbox' || item.key === 'commercial';
          return (
            <Tab
              key={item.key}
              value={item.key}
              icon={item.icon}
              iconPosition="start"
              label={
                isInboxLine ? (
                  <InboxLineTabLabel
                    title={item.label}
                    phone={item.phone ?? ''}
                    compact={compactTabs}
                  />
                ) : compactTabs ? undefined : (
                  item.label
                )
              }
              aria-label={item.ariaLabel ?? item.label}
              sx={{
                '& .MuiTab-iconWrapper': {
                  mr: compactTabs && !isInboxLine ? 0 : 0.75,
                },
                ...(isInboxLine && item.line ? inboxLineTabSx(item.line) : null),
              }}
            />
          );
        })}
      </Tabs>

      <Divider
        orientation="vertical"
        flexItem
        sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'stretch', my: 0.5 }}
      />

      <Stack
        direction="row"
        spacing={0.75}
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: { xs: 'flex-end', md: 'flex-end' },
          flex: { xs: '1 1 100%', lg: '0 0 auto' },
          ml: { xs: 0, lg: 'auto' },
        }}
      >
        <WhatsAppInternalContactsButton />

        {showBulk && (
          <Tooltip title="Envío masivo WhatsApp">
            <Button
              variant="outlined"
              size="small"
              startIcon={<SendIcon />}
              onClick={onOpenBulk}
              sx={{ textTransform: 'none' }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                Masivo
              </Box>
            </Button>
          </Tooltip>
        )}

        <ThemeToggle size="small" />

        <Chip
          label={profile?.email ?? 'Admin'}
          size="small"
          variant="outlined"
          sx={{ display: { xs: 'none', md: 'inline-flex' }, maxWidth: 180 }}
        />

        <Button
          variant="text"
          color="inherit"
          size="small"
          startIcon={<LogoutIcon />}
          onClick={() => void signOut()}
          sx={{ minWidth: { xs: 36, sm: 'auto' }, px: { xs: 0.75, sm: 1.5 } }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Salir
          </Box>
        </Button>
      </Stack>
    </Box>
  );
};

export default WhatsAppTopBar;
