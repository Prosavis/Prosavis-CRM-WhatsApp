import React from 'react';
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
  BarChart as BarChartIcon,
  ContactPhone as ContactPhoneIcon,
  ConfirmationNumber as ConfirmationNumberIcon,
  Settings as SettingsIcon,
  MonitorHeart as MonitorHeartIcon,
  Send as SendIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import ThemeToggle from '@/components/common/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getProSavisLogoSrc } from '@/utils/prosavisBrand';
import WhatsAppInternalContactsButton from './WhatsAppInternalContactsButton';

export interface WhatsAppTopBarProps {
  activeTab: number;
  onTabChange: (_: React.SyntheticEvent, value: number) => void;
  inboxTotalContacts: number | null;
  onOpenBulk: () => void;
}

const TAB_ITEMS = [
  { icon: <InboxIcon fontSize="small" />, label: 'Inbox' },
  { icon: <BarChartIcon fontSize="small" />, label: 'Métricas' },
  { icon: <ContactPhoneIcon fontSize="small" />, label: 'Directorio' },
  { icon: <ConfirmationNumberIcon fontSize="small" />, label: 'Descuentos' },
  { icon: <SettingsIcon fontSize="small" />, label: 'Configuración' },
  { icon: <MonitorHeartIcon fontSize="small" />, label: 'Monitoreo' },
] as const;

const WhatsAppTopBar: React.FC<WhatsAppTopBarProps> = ({
  activeTab,
  onTabChange,
  inboxTotalContacts,
  onOpenBulk,
}) => {
  const { mode } = useTheme();
  const { profile, signOut } = useAuth();
  const muiTheme = useMuiTheme();
  const compactTabs = useMediaQuery(muiTheme.breakpoints.down('sm'));

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
        src={getProSavisLogoSrc(mode)}
        alt="ProSavis"
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
        {TAB_ITEMS.map(({ icon, label }) => (
          <Tab
            key={label}
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

        {inboxTotalContacts !== null && (
          <Tooltip title="Total de conversaciones en esta línea (incluye archivadas)">
            <Chip
              size="small"
              color="primary"
              label={`${inboxTotalContacts.toLocaleString('es-CO')} contactos`}
              sx={{
                fontWeight: 600,
                display: { xs: 'none', sm: 'inline-flex' },
              }}
              variant="outlined"
            />
          </Tooltip>
        )}

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
