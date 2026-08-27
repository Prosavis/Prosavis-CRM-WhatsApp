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
import { useTheme as useMuiTheme } from '@mui/material/styles';
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
import type { WhatsAppTabKey } from '@/utils/whatsappTabs';
import WhatsAppInternalContactsButton from './WhatsAppInternalContactsButton';

export interface WhatsAppTopBarProps {
  activeTab: WhatsAppTabKey;
  onTabChange: (_: React.SyntheticEvent, value: WhatsAppTabKey) => void;
  directoryTotalContacts: number | null;
  onOpenBulk: () => void;
  showBulk?: boolean;
}

function buildTabItems(directoryTotalContacts: number | null) {
  const directoryLabel =
    directoryTotalContacts != null
      ? `Directorio (${directoryTotalContacts.toLocaleString('es-CO')})`
      : 'Directorio';

  return [
    { key: 'inbox' as const, icon: <InboxIcon fontSize="small" />, label: 'Inbox Bot' },
    { key: 'commercial' as const, icon: <StorefrontIcon fontSize="small" />, label: 'Inbox Comercial' },
    { key: 'metrics' as const, icon: <BarChartIcon fontSize="small" />, label: 'Métricas' },
    { key: 'leads' as const, icon: <ContactPhoneIcon fontSize="small" />, label: directoryLabel },
    { key: 'discounts' as const, icon: <ConfirmationNumberIcon fontSize="small" />, label: 'Descuentos' },
    { key: 'settings' as const, icon: <SettingsIcon fontSize="small" />, label: 'Configuración' },
    { key: 'monitoreo' as const, icon: <MonitorHeartIcon fontSize="small" />, label: 'Monitoreo' },
    { key: 'automations' as const, icon: <AutoAwesomeIcon fontSize="small" />, label: 'Automatizaciones' },
  ];
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
          minHeight: 40,
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
        {tabItems.map(({ key, icon, label }) => (
          <Tab
            key={key}
            value={key}
            icon={icon}
            iconPosition="start"
            label={compactTabs ? undefined : label}
            aria-label={label}
            sx={{
              '& .MuiTab-iconWrapper': { mr: compactTabs ? 0 : 0.75 },
            }}
          />
        ))}
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
