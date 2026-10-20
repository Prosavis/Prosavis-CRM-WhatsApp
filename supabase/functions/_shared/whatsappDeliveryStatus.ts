/** Statuses Meta sends for an outbound message that did reach the customer. `played` is a voice note that was heard. */
export function isOutboundDeliverySuccess(status: string): boolean {
  switch (status) {
    case 'sent':
    case 'delivered':
    case 'read':
    case 'played':
      return true;
    default:
      return false;
  }
}
