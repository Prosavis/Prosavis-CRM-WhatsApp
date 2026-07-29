import React, { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  Collapse,
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
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import {
  INBOX_CATEGORIES,
  type InboxCategoryId,
} from '@/constants/inboxCategories';
import {
  getTabCountForCategory,
  type WhatsAppTabCounts,
} from '@/utils/whatsappInboxStats';
import type { WhatsAppTag } from '@/services/whatsappService';
import type { WhatsAppTagFolder } from '@/types/whatsapp';
import { buildTagFolderDisplayItems } from '@/utils/tagFolders';

const CATEGORY_ICONS: Record<InboxCategoryId, React.ReactNode> = {
  last24h: <AccessTimeIcon fontSize="small" />,
  all: <AllInboxIcon fontSize="small" />,
  unread: <MarkEmailUnreadIcon fontSize="small" />,
  archived: <ArchiveIcon fontSize="small" />,
  agendados: <EventAvailableIcon fontSize="small" />,
  fuera_cobertura: <LocationOffIcon fontSize="small" />,
  trabajo: <WorkOutlineIcon fontSize="small" />,
  empresas: <BusinessOutlinedIcon fontSize="small" />,
};

export interface InboxCategorySidebarProps {
  category: InboxCategoryId;
  onCategoryChange: (category: InboxCategoryId) => void;
  tabCounts: WhatsAppTabCounts;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onConfigureOutOfCoverage?: () => void;
  /** Organización visual de tags (carpetas compartidas). */
  tags?: WhatsAppTag[];
  tagFolders?: WhatsAppTagFolder[];
  selectedTagIds?: string[];
  onToggleTagFilter?: (tagId: string) => void;
  tagCountsById?: Record<string, number>;
}

const InboxCategorySidebar: React.FC<InboxCategorySidebarProps> = ({
  category,
  onCategoryChange,
  tabCounts,
  collapsed,
  onCollapsedChange,
  onConfigureOutOfCoverage,
  tags = [],
  tagFolders = [],
  selectedTagIds = [],
  onToggleTagFilter,
  tagCountsById,
}) => {
  const theme = useTheme();
  const [folderCollapsed, setFolderCollapsed] = useState<Record<string, boolean>>({});
  const tagItems = useMemo(
    () => buildTagFolderDisplayItems(tags, tagFolders),
    [tags, tagFolders],
  );
  const showTagOrg = Boolean(onToggleTagFilter) && (tags.length > 0 || tagFolders.length > 0);
  // Ancho suficiente para "Fuera de cobertura" + conteo + engranaje sin truncar.
  const width = collapsed ? 56 : 268;

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
                  px: collapsed ? 0.75 : 1,
                  py: 0.75,
                  alignItems: 'flex-start',
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
                    minWidth: collapsed ? 0 : 32,
                    mt: collapsed ? 0 : 0.15,
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
                      sx: {
                        whiteSpace: 'normal',
                        lineHeight: 1.25,
                        wordBreak: 'break-word',
                      },
                    }}
                    sx={{ my: 0, mr: 0.5 }}
                  />
                )}
                {!collapsed && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: selected ? 700 : 500,
                      fontVariantNumeric: 'tabular-nums',
                      color: selected ? 'primary.main' : 'text.secondary',
                      ml: 0.25,
                      flexShrink: 0,
                    }}
                  >
                    {count}
                  </Typography>
                )}
                {showConfig && !collapsed && (
                  <Tooltip title="Configurar tags de esta categoría">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfigureOutOfCoverage?.();
                      }}
                      aria-label="Configurar tags de Fuera de cobertura"
                      sx={{ flexShrink: 0, ml: 0.25, p: 0.35 }}
                    >
                      <SettingsOutlinedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItemButton>
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

        {showTagOrg && !collapsed && (
          <>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                px: 1.5,
                pt: 1.25,
                pb: 0.5,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: 'text.secondary',
              }}
            >
              Tags
            </Typography>
            {tagItems.map((item) => {
              if (item.type === 'tag') {
                const checked = selectedTagIds.includes(item.tag.id);
                const cnt = tagCountsById?.[item.tag.id];
                return (
                  <ListItemButton
                    key={item.tag.id}
                    dense
                    selected={checked}
                    onClick={() => onToggleTagFilter?.(item.tag.id)}
                    sx={{
                      mx: 0.75,
                      my: 0.1,
                      borderRadius: 1.5,
                      minHeight: 34,
                      '&.Mui-selected': {
                        bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                      },
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={checked}
                      tabIndex={-1}
                      disableRipple
                      sx={{ p: 0.25, mr: 0.5, pointerEvents: 'none' }}
                    />
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: item.tag.color || '#1976d2',
                        mr: 1,
                        flexShrink: 0,
                      }}
                    />
                    <ListItemText
                      primary={item.tag.name}
                      primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    />
                    {cnt !== undefined && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        {cnt}
                      </Typography>
                    )}
                  </ListItemButton>
                );
              }

              const expanded = folderCollapsed[item.folder.id] !== true;
              return (
                <Box key={`folder-${item.folder.id}`}>
                  <ListItemButton
                    dense
                    onClick={() =>
                      setFolderCollapsed((prev) => ({
                        ...prev,
                        [item.folder.id]: expanded,
                      }))
                    }
                    sx={{ mx: 0.75, my: 0.1, borderRadius: 1.5, minHeight: 34 }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <FolderOutlinedIcon fontSize="small" color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.folder.name}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                    />
                    {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </ListItemButton>
                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                    {item.tags.map((tag) => {
                      const checked = selectedTagIds.includes(tag.id);
                      const cnt = tagCountsById?.[tag.id];
                      return (
                        <ListItemButton
                          key={tag.id}
                          dense
                          selected={checked}
                          onClick={() => onToggleTagFilter?.(tag.id)}
                          sx={{
                            mx: 0.75,
                            my: 0.1,
                            pl: 3.5,
                            borderRadius: 1.5,
                            minHeight: 32,
                            '&.Mui-selected': {
                              bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                            },
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={checked}
                            tabIndex={-1}
                            disableRipple
                            sx={{ p: 0.25, mr: 0.5, pointerEvents: 'none' }}
                          />
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: tag.color || '#1976d2',
                              mr: 1,
                              flexShrink: 0,
                            }}
                          />
                          <ListItemText
                            primary={tag.name}
                            primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                          />
                          {cnt !== undefined && (
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                              {cnt}
                            </Typography>
                          )}
                        </ListItemButton>
                      );
                    })}
                  </Collapse>
                </Box>
              );
            })}
          </>
        )}

        {showTagOrg && collapsed && (
          <Tooltip title="Tags organizados (expande el panel)" placement="right">
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <LocalOfferOutlinedIcon fontSize="small" color="action" />
            </Box>
          </Tooltip>
        )}
      </List>
    </Box>
  );
};

export default InboxCategorySidebar;
