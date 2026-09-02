import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme as useMuiTheme, type Theme } from '@mui/material/styles';
import InboxIcon from '@mui/icons-material/Inbox';
import StorefrontIcon from '@mui/icons-material/Storefront';
import BarChartIcon from '@mui/icons-material/BarChart';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import SettingsIcon from '@mui/icons-material/Settings';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DarkModeIcon from '@mui/icons-material/Brightness4';
import LightModeIcon from '@mui/icons-material/Brightness7';
import LogoutIcon from '@mui/icons-material/Logout';
import { playThemeTransitionSound } from '@/components/common/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getProsavisLogoSrc } from '@/utils/prosavisBrand';
import {
  DIRECTORY_SHELL_HEX,
  DIRECTORY_TAB_HEX,
  DIRECTORY_TAB_INK_HEX,
} from '@/utils/inboxLineVisual';
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

function directoryTabSx(selected: boolean) {
  return {
    borderRadius: 1.5,
    px: { xs: 1, sm: 1.25 },
    py: 0.6,
    minHeight: 48,
    gap: 0.75,
    fontWeight: 800,
    border: '1px solid',
    color: selected
      ? DIRECTORY_TAB_INK_HEX
      : (theme: Theme) =>
          theme.palette.mode === 'dark' ? DIRECTORY_TAB_HEX : DIRECTORY_TAB_INK_HEX,
    bgcolor: selected
      ? DIRECTORY_TAB_HEX
      : (theme: Theme) =>
          alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.24 : 0.16),
    borderColor: selected
      ? 'success.main'
      : (theme: Theme) =>
          alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.5 : 0.42),
  };
}

function specialTabSx(kind: 'bot' | 'commercial', selected: boolean) {
  const paletteKey = kind === 'commercial' ? 'secondary' : 'primary';
  const idleAlpha = kind === 'bot' ? 0.08 : 0.12;
  const borderAlpha = kind === 'bot' ? 0.38 : 0.5;
  return {
    minHeight: 48,
    minWidth: 0,
    px: { xs: 1, sm: 1.35 },
    py: 0.6,
    borderRadius: 2,
    border: '1px solid',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.75,
    fontWeight: 800,
    textTransform: 'none' as const,
    bgcolor: selected
      ? `${paletteKey}.main`
      : (theme: Theme) => alpha(theme.palette[paletteKey].main, idleAlpha),
    color: selected
      ? `${paletteKey}.contrastText`
      : kind === 'commercial'
        ? 'secondary.dark'
        : 'primary.main',
    borderColor: selected
      ? `${paletteKey}.main`
      : (theme: Theme) => alpha(theme.palette[paletteKey].main, borderAlpha),
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

  const bot = useMemo(() => inboxLineNavMeta('bot'), []);
  const commercial = useMemo(() => inboxLineNavMeta('commercial'), []);
  const directory = useMemo(
    () => directoryNavMeta(directoryTotalContacts),
    [directoryTotalContacts],
  );
  const directorySelected = activeTab === 'leads';
  const botSelected = activeTab === 'inbox';
  const commercialSelected = activeTab === 'commercial';
  const discountsSelected = activeTab === 'discounts';

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

      <Stack
        direction="row"
        spacing={1}
        data-tour="whatsapp-tabs"
        sx={{
          flex: '1 1 280px',
          minWidth: 0,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            pl: 0.75,
            pr: 0.75,
            py: 0.5,
            minHeight: 56,
            width: 'max-content',
            maxWidth: '100%',
            borderRadius: 2,
            border: '1px solid',
            borderColor: alpha(DIRECTORY_SHELL_HEX, 0.42),
            bgcolor: (theme) => alpha(DIRECTORY_SHELL_HEX, theme.palette.mode === 'dark' ? 0.22 : 0.1),
            flexWrap: 'wrap',
          }}
        >
          <ButtonBase
            onClick={(event) => onTabChange(event, 'leads')}
            aria-label={directory.ariaLabel}
            aria-pressed={directorySelected}
            sx={directoryTabSx(directorySelected)}
          >
            <ContactPhoneIcon fontSize="small" />
            <SpecialTabLabel
              title={directory.title}
              subtitle={directory.count}
              compact={compactTabs}
            />
          </ButtonBase>
          <ButtonBase
            onClick={(event) => {
              event.stopPropagation();
              onTabChange(event, 'inbox');
            }}
            aria-label={bot.ariaLabel}
            aria-pressed={botSelected}
            sx={specialTabSx('bot', botSelected)}
          >
            <InboxIcon fontSize="small" />
            <SpecialTabLabel title={bot.title} subtitle={bot.phone} compact={compactTabs} />
          </ButtonBase>
          <ButtonBase
            onClick={(event) => {
              event.stopPropagation();
              onTabChange(event, 'commercial');
            }}
            aria-label={commercial.ariaLabel}
            aria-pressed={commercialSelected}
            sx={specialTabSx('commercial', commercialSelected)}
          >
            <StorefrontIcon fontSize="small" />
            <SpecialTabLabel
              title={commercial.title}
              subtitle={commercial.phone}
              compact={compactTabs}
            />
          </ButtonBase>
        </Box>

        <ButtonBase
          onClick={(event) => onTabChange(event, 'discounts')}
          aria-label="Descuentos"
          aria-pressed={discountsSelected}
          sx={{
            minHeight: 40,
            px: { xs: 1, sm: 1.5 },
            py: 0.5,
            borderRadius: 2,
            gap: 0.75,
            fontWeight: 600,
            fontSize: '0.8125rem',
            textTransform: 'none',
            color: discountsSelected ? 'primary.main' : 'text.primary',
            bgcolor: discountsSelected ? (theme) => alpha(theme.palette.primary.main, 0.1) : 'transparent',
          }}
        >
          <ConfirmationNumberIcon fontSize="small" />
          {compactTabs ? null : 'Descuentos'}
        </ButtonBase>
      </Stack>

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
