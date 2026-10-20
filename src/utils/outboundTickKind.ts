export type OutboundTickKind = 'read' | 'delivered' | 'sent' | 'failed' | 'pending';

/** Maps a WhatsApp delivery status to the tick shown in the thread and the chat list. */
export function outboundTickKind(
  status: string | null | undefined,
  options?: { emptyAs?: 'sent' | 'pending' },
): OutboundTickKind {
  const emptyAs = options?.emptyAs ?? 'pending';
  const normalized = (status ?? '').trim().toLowerCase();
  if (!normalized) return emptyAs;
  switch (normalized) {
    case 'read':
    case 'played':
      return 'read';
    case 'delivered':
      return 'delivered';
    case 'sent':
      return 'sent';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}
