import React from 'react';
import {
  Box,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AllInboxIcon from '@mui/icons-material/AllInbox';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';
import ArchiveIcon from '@mui/icons-material/Archive';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import LocationOffIcon from '@mui/icons-material/LocationOff';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import {
  INBOX_CATEGORIES,
  type InboxCategoryId,
} from '@/constants/inboxCategories';
import {
  getTabCountForCategory,
  type WhatsAppTabCounts,
} from '@/utils/whatsappInboxStats';

const CATEGORY_ICONS: Record<InboxCategoryId, React.ReactNode> = {
  last24h: <AccessTimeIcon fontSize="small" />,
  all: <AllInboxIcon fontSize="small" />,
  unread: <MarkEmailUnreadIcon fontSize="small" />,
  archived: <ArchiveIcon fontSize="small" />,
  agendados: <EventAvailableIcon fontSize="small" />,
  fuera_cobertura: <LocationOffIcon fontSize="small" />,
  trabajo: <WorkOutlineIcon fontSize="small" />,
};

export interface InboxCategorySidebarProps {
  category: InboxCategoryId;
  onCategoryChange: (category: InboxCategoryId) => void;
  tabCounts: WhatsAppTabCounts;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onConfigureOutOfCoverage?: () => void;
}

const InboxCategorySidebar: React.FC<InboxCategorySidebarProps> = ({
  category,
  onCategoryChange,
  tabCounts,
  collapsed,
  onCollapsedChange,
  onConfigureOutOfCoverage,
}) => {
  const theme = useTheme();
  const width = collapsed ? 56 : 220;

  return (
    <Box
      data-tour="whatsapp-inbox-categories"
      sx={{
        width,
        minWidth: width,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: (t) =>
          t.palette.mode === 'dark'
            ? alpha(t.palette.common.white, 0.02)
            : alpha(t.palette.grey[500], 0.04),
        transition: theme.transitions.create(['width', 'min-width'], {
          duration: theme.transitions.duration.shorter,
        }),
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0.5 : 1.25,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 48,
        }}
      >
        {!collapsed && (
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            Categorías
          </Typography>
        )}
        <Tooltip title={collapsed ? 'Mostrar categorías' : 'Ocultar categorías'}>
          <IconButton
            size="small"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-label={collapsed ? 'Expandir categorías' : 'Colapsar categorías'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      <List dense disablePadding sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
        {INBOX_CATEGORIES.map((item) => {
          const selected = category === item.id;
          const count = getTabCountForCategory(tabCounts, item.id);
          const icon = CATEGORY_ICONS[item.id];
          const showConfig = item.id === 'fuera_cobertura' && Boolean(onConfigureOutOfCoverage);

          const row = (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                mx: collapsed ? 0.5 : 0.75,
                my: 0.15,
                gap: 0.25,
              }}
            >
              <ListItemButton
                selected={selected}
                onClick={() => onCategoryChange(item.id)}
                aria-label={`${item.label}: ${count}`}
                title={item.description}
                sx={{
                  flex: 1,
                  borderRadius: 1.5,
                  minHeight: 40,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 0.75 : 1.25,
                  '&.Mui-selected': {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                    '&:hover': {
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.18),
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: collapsed ? 0 : 36,
                    color: selected ? 'primary.main' : 'text.secondary',
                    justifyContent: 'center',
                  }}
                >
                  {icon}
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: selected ? 600 : 500,
                      noWrap: true,
                    }}
                  />
                )}
                {!collapsed && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: selected ? 700 : 500,
                      fontVariantNumeric: 'tabular-nums',
                      color: selected ? 'primary.main' : 'text.secondary',
                      ml: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    {count}
                  </Typography>
                )}
              </ListItemButton>
              {showConfig && !collapsed && (
                <Tooltip title="Configurar tags de esta categoría">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfigureOutOfCoverage?.();
                    }}
                    aria-label="Configurar tags de Fuera de cobertura"
                    sx={{ flexShrink: 0 }}
                  >
                    <SettingsOutlinedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.id} title={`${item.label} (${count})`} placement="right">
                {row}
              </Tooltip>
            );
          }
          return row;
        })}
      </List>
    </Box>
  );
};

export default InboxCategorySidebar;
