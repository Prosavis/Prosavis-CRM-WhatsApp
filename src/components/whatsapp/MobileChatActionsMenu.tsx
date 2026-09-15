import { useState } from 'react';
import {
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';

interface MobileChatActionsMenuProps {
  archived: boolean;
  pinned: boolean;
  forceUnread: boolean;
  bookingLoading: boolean;
  onOpenTags: (anchor: HTMLElement) => void;
  onSelectMessages: () => void;
  onArchiveToggle: () => void;
  onPinToggle: () => void;
  onMarkUnread: () => void;
  onOpenContact: () => void;
  onOpenBooking: () => void;
  onOpenTemplates: () => void;
  onDeleteConversation: () => void;
}

export default function MobileChatActionsMenu({
  archived,
  pinned,
  forceUnread,
  bookingLoading,
  onOpenTags,
  onSelectMessages,
  onArchiveToggle,
  onPinToggle,
  onMarkUnread,
  onOpenContact,
  onOpenBooking,
  onOpenTemplates,
  onDeleteConversation,
}: MobileChatActionsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const run = (action: () => void) => {
    setAnchor(null);
    action();
  };

  return (
    <>
      <IconButton
        aria-label="Más acciones del chat"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ width: 44, height: 44, flexShrink: 0 }}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            const target = anchor;
            setAnchor(null);
            if (target) onOpenTags(target);
          }}
        >
          <ListItemIcon><LocalOfferIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Tags</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onSelectMessages)}>
          <ListItemIcon><CheckBoxOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Seleccionar mensajes</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onArchiveToggle)}>
          <ListItemIcon>
            {archived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{archived ? 'Desarchivar' : 'Archivar'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onPinToggle)}>
          <ListItemIcon>
            {pinned ? <PushPinOutlinedIcon fontSize="small" /> : <PushPinIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{pinned ? 'Desfijar' : 'Fijar arriba'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onMarkUnread)}>
          <ListItemIcon><MarkChatUnreadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{forceUnread ? 'Marcar como leído' : 'Marcar como no leído'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onOpenContact)}>
          <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Ficha del cliente</ListItemText>
        </MenuItem>
        <MenuItem disabled={bookingLoading} onClick={() => run(onOpenBooking)}>
          <ListItemIcon>
            {bookingLoading ? <CircularProgress size={18} /> : <CalendarMonthIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>Asistente de booking</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onOpenTemplates)}>
          <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Plantillas</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onDeleteConversation)}>
          <ListItemIcon><DeleteForeverOutlinedIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Eliminar conversación</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
