import React from 'react';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

export type OutboundPreviewStatus = 'sent' | 'delivered' | 'read' | 'failed' | string | undefined;

/** Misma paleta que `MessageBubble` (`StatusIcon`) para paridad visual lista ↔ hilo. */
const OutboundPreviewTicks: React.FC<{ status?: OutboundPreviewStatus }> = ({ status }) => {
  const s = (status || 'sent').toLowerCase();
  const tickSx = { fontSize: 15, lineHeight: 1 };

  switch (s) {
    case 'read':
      return <DoneAllIcon sx={{ ...tickSx, color: '#53bdeb' }} titleAccess="Leído" />;
    case 'delivered':
      return <DoneAllIcon sx={{ ...tickSx, color: '#8696a0' }} titleAccess="Entregado" />;
    case 'failed':
      return <ErrorOutlineIcon sx={{ ...tickSx, color: '#ea0038' }} titleAccess="No entregado" />;
    case 'sent':
      return <DoneIcon sx={{ ...tickSx, color: '#8696a0' }} titleAccess="Enviado" />;
    default:
      return <AccessTimeIcon sx={{ ...tickSx, color: '#8696a0' }} titleAccess="Estado desconocido" />;
  }
};

export default OutboundPreviewTicks;
