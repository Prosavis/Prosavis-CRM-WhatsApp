import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
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
  AdminPanelSettings as AdminPanelSettingsIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { playThemeTransitionSound } from '@/components/common/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getProsavisLogoSrc } from '@/utils/prosavisBrand';
import { directoryNavMeta, inboxLineNavMeta } from '@/utils/whatsappInboxNav';
import { isWhatsAppAdminTab, type WhatsAppTabKey } from '@/utils/whatsappTabs';
import CompanyHandbookBook from './CompanyHandbookBook';
import CrmTutorialPlaceholder from './CrmTutorialPlaceholder';

export interface WhatsAppTopBarProps {
  activeTab: WhatsAppTabKey;
  onTabChange: (_: React.SyntheticEvent, value: WhatsAppTabKey) => void;
  directoryTotalContacts: number | null;
}

const ADMIN_MENU_ITEMS: Array<{
  key: Extract<WhatsAppTabKey, 'metrics' | 'monitoreo' | 'automations' | 'settings'>;
  label: string;
  icon: React.ReactElement;
}> = [
  { key: 'metrics', label: 'Métricas', icon: <BarChartIcon fontSize="small" /> },
  { key: 'monitoreo', label: 'Monitoreo', icon: <MonitorHeartIcon fontSize="small" /> },
  { key: 'automations', label: 'Automatizaciones', icon: <AutoAwesomeIcon fontSize="small" /> },
  { key: 'settings', label: 'Configuración', icon: <SettingsIcon fontSize="small" /> },
];

function SpecialTabLabel({
  title,
  subtitle,
  compact,
}: {
  title: string;
  subtitle: string;
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
      {subtitle ? (
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
          {subtitle}
        </Box>
      ) : null}
    </Box>
  );
}

function specialTabSx(kind: 'bot' | 'commercial' | 'directory') {
  const paletteKey = kind === 'commercial' ? 'secondary' : 'primary';
  const idleAlpha = kind === 'directory' ? 0.16 : kind === 'bot' ? 0.08 : 0.12;
  const borderAlpha = kind === 'directory' ? 0.55 : kind === 'bot' ? 0.38 : 0.5;
  return {
    minHeight: 56,
    mx: 0.25,
    px: { xs: 1, sm: 1.35 },
    py: 0.6,
    mr: kind === 'directory' ? 1.25 : 0.25,
    borderRadius: 2,
    border: 1,
    alignItems: 'center',
    fontWeight: 800,
    bgcolor: (theme: Theme) => alpha(theme.palette[paletteKey].main, idleAlpha),
    color: kind === 'commercial' ? 'secondary.dark' : 'primary.main',
    borderColor: (theme: Theme) => alpha(theme.palette[paletteKey].main, borderAlpha),
    '&.Mui-selected': {
      bgcolor: `${paletteKey}.main`,
      color: `${paletteKey}.contrastText`,
      borderColor: `${paletteKey}.main`,
    },
  };
}

const WhatsAppTopBar: React.FC<WhatsAppTopBarProps> = ({
  activeTab,
  onTabChange,
  directoryTotalContacts,
}) => {
  const { mode, toggleMode } = useTheme();
  const { profile, signOut } = useAuth();
  const muiTheme = useMuiTheme();
  const compactTabs = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const [adminAnchor, setAdminAnchor] = useState<null | HTMLElement>(null);
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const adminOpen = Boolean(adminAnchor);
  const accountOpen = Boolean(accountAnchor);
  const adminActive = isWhatsAppAdminTab(activeTab);
  const accountEmail = profile?.email ?? 'Admin';
  const accountInitial = (profile?.displayName?.trim()?.[0] || accountEmail[0] || 'A').toUpperCase();

  const tabItems = useMemo(() => {
    const bot = inboxLineNavMeta('bot');
    const commercial = inboxLineNavMeta('commercial');
    const directory = directoryNavMeta(directoryTotalContacts);
    return [
      {
        key: 'inbox' as const,
        icon: <InboxIcon fontSize="small" />,
        title: bot.title,
        subtitle: bot.phone,
        ariaLabel: bot.ariaLabel,
        kind: 'bot' as const,
      },
      {
        key: 'commercial' as const,
        icon: <StorefrontIcon fontSize="small" />,
        title: commercial.title,
        subtitle: commercial.phone,
        ariaLabel: commercial.ariaLabel,
        kind: 'commercial' as const,
      },
      {
        key: 'leads' as const,
        icon: <ContactPhoneIcon fontSize="small" />,
        title: directory.title,
        subtitle: directory.count,
        ariaLabel: directory.ariaLabel,
        kind: 'directory' as const,
      },
      {
        key: 'discounts' as const,
        icon: <ConfirmationNumberIcon fontSize="small" />,
        title: 'Descuentos',
        subtitle: '',
        ariaLabel: 'Descuentos',
        kind: null,
      },
    ];
  }, [directoryTotalContacts]);

  const tabsValue = adminActive ? false : activeTab;

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
        value={tabsValue}
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
          const isSpecial = item.kind != null;
          return (
            <Tab
              key={item.key}
              value={item.key}
              icon={item.icon}
              iconPosition="start"
              label={
                isSpecial ? (
                  <SpecialTabLabel
                    title={item.title}
                    subtitle={item.subtitle}
                    compact={compactTabs}
                  />
                ) : compactTabs ? undefined : (
                  item.title
                )
              }
              aria-label={item.ariaLabel}
              sx={{
                '& .MuiTab-iconWrapper': {
                  mr: compactTabs && !isSpecial ? 0 : 0.75,
                },
                ...(item.kind ? specialTabSx(item.kind) : null),
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
        <Button
          variant={adminActive ? 'contained' : 'outlined'}
          color="primary"
          size="small"
          startIcon={<AdminPanelSettingsIcon />}
          aria-label="Administradores"
          aria-haspopup="true"
          aria-expanded={adminOpen ? 'true' : undefined}
          onClick={(event) => setAdminAnchor(event.currentTarget)}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 36,
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Admin
          </Box>
        </Button>
        <Menu
          anchorEl={adminAnchor}
          open={adminOpen}
          onClose={() => setAdminAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {ADMIN_MENU_ITEMS.map((item) => (
            <MenuItem
              key={item.key}
              selected={activeTab === item.key}
              onClick={(event) => {
                setAdminAnchor(null);
                onTabChange(event, item.key);
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText>{item.label}</ListItemText>
            </MenuItem>
          ))}
        </Menu>

        <CompanyHandbookBook />
        <CrmTutorialPlaceholder />

        <Tooltip title="Cuenta">
          <IconButton
            size="small"
            aria-label="Cuenta"
            aria-haspopup="true"
            aria-expanded={accountOpen ? 'true' : undefined}
            onClick={(event) => setAccountAnchor(event.currentTarget)}
            sx={{ width: 36, height: 36 }}
          >
            <Avatar
              sx={{
                width: 28,
                height: 28,
                fontSize: '0.8rem',
                fontWeight: 700,
                bgcolor: 'primary.main',
              }}
            >
              {accountInitial}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={accountAnchor}
          open={accountOpen}
          onClose={() => setAccountAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { minWidth: 220 } } }}
        >
          <Box sx={{ px: 2, py: 1.25, maxWidth: 260 }}>
            <Typography variant="caption" color="text.secondary">
              Cuenta
            </Typography>
            <Typography variant="body2" noWrap fontWeight={600}>
              {accountEmail}
            </Typography>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              playThemeTransitionSound();
              toggleMode();
            }}
          >
            <ListItemIcon>
              {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{mode === 'light' ? 'Modo oscuro' : 'Modo claro'}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAccountAnchor(null);
              void signOut();
            }}
          >
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Salir</ListItemText>
          </MenuItem>
        </Menu>
      </Stack>
    </Box>
  );
};

export default WhatsAppTopBar;
