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
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import type { WhatsAppTag } from '@/services/whatsappService';
import type { WhatsAppTagFolder } from '@/types/whatsapp';
import { buildTagFolderDisplayItems, isInboxTagFolderExpanded } from '@/utils/tagFolders';

export interface TagListGroupedProps {
  tags: WhatsAppTag[];
  folders: WhatsAppTagFolder[];
  /** Si se provee, cada tag muestra checkbox con este estado. */
  isChecked?: (tagId: string) => boolean;
  onTagClick: (tag: WhatsAppTag) => void;
  disabled?: boolean;
  /** Contador opcional a la derecha de cada tag. */
  getCount?: (tagId: string) => number | string | undefined;
  emptyMessage?: string;
  dense?: boolean;
  /** Carpetas arrancan contraídas salvo que se pida lo contrario. */
  defaultExpanded?: boolean;
}

const TagListGrouped: React.FC<TagListGroupedProps> = ({
  tags,
  folders,
  isChecked,
  onTagClick,
  disabled = false,
  getCount,
  emptyMessage = 'No hay tags',
  dense = true,
  defaultExpanded = false,
}) => {
  const items = useMemo(
    () => buildTagFolderDisplayItems(tags, folders),
    [tags, folders],
  );
  const [folderOpened, setFolderOpened] = useState<Record<string, boolean>>({});

  const isFolderExpanded = (folderId: string, hasSelectedTag: boolean) =>
    isInboxTagFolderExpanded({
      userOpened: folderOpened[folderId],
      hasSelectedTag,
      defaultExpanded,
    });

  const toggleFolder = (folderId: string, hasSelectedTag: boolean) => {
    setFolderOpened((prev) => ({
      ...prev,
      [folderId]: !isFolderExpanded(folderId, hasSelectedTag),
    }));
  };

  const renderTagRow = (tag: WhatsAppTag, indent = false) => {
    const checked = isChecked?.(tag.id) ?? false;
    const count = getCount?.(tag.id);
    return (
      <ListItemButton
        key={tag.id}
        onClick={() => onTagClick(tag)}
        disabled={disabled}
        dense={dense}
        sx={{ pl: indent ? 3.5 : 1.5 }}
      >
        {isChecked && (
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Checkbox
              edge="start"
              checked={checked}
              tabIndex={-1}
              disableRipple
              size="small"
              sx={{ pointerEvents: 'none' }}
            />
          </ListItemIcon>
        )}
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: tag.color || '#1976d2',
            mr: 1,
            flexShrink: 0,
          }}
        />
        <ListItemText
          primary={tag.name}
          primaryTypographyProps={{ variant: 'body2' }}
          sx={{ flex: '1 1 auto', minWidth: 0 }}
        />
        {count !== undefined && (
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1 }}>
            {count}
          </Typography>
        )}
      </ListItemButton>
    );
  };

  if (tags.length === 0 && folders.length === 0) {
    return (
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <List dense={dense} sx={{ py: 0 }}>
      {items.map((item) => {
        if (item.type === 'tag') {
          return renderTagRow(item.tag);
        }
        const hasSelectedTag = item.tags.some((tag) => isChecked?.(tag.id) === true);
        const expanded = isFolderExpanded(item.folder.id, hasSelectedTag);
        return (
          <Box key={`folder-${item.folder.id}`}>
            <ListItemButton
              onClick={() => toggleFolder(item.folder.id, hasSelectedTag)}
              dense={dense}
              sx={{ pl: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <FolderOutlinedIcon fontSize="small" color="action" />
              </ListItemIcon>
              <ListItemText
                primary={item.folder.name}
                secondary={
                  item.tags.length === 0
                    ? 'Vacía'
                    : `${item.tags.length} tag${item.tags.length === 1 ? '' : 's'}`
                }
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              <IconButton size="small" edge="end" tabIndex={-1} sx={{ pointerEvents: 'none' }}>
                {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </ListItemButton>
            <Collapse in={expanded} timeout="auto" unmountOnExit>
              {item.tags.length === 0 ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', pl: 5, py: 0.5 }}
                >
                  Sin tags en esta carpeta
                </Typography>
              ) : (
                item.tags.map((tag) => renderTagRow(tag, true))
              )}
            </Collapse>
          </Box>
        );
      })}
    </List>
  );
};

export default TagListGrouped;
