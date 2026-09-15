import '@/test/setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MobileChatActionsMenu from './MobileChatActionsMenu';

function renderMenu() {
  const onOpenContact = vi.fn();
  const user = userEvent.setup();
  render(
    <MobileChatActionsMenu
      archived={false}
      pinned={false}
      forceUnread={false}
      bookingLoading={false}
      onOpenTags={vi.fn()}
      onSelectMessages={vi.fn()}
      onArchiveToggle={vi.fn()}
      onPinToggle={vi.fn()}
      onMarkUnread={vi.fn()}
      onOpenContact={onOpenContact}
      onOpenBooking={vi.fn()}
      onOpenTemplates={vi.fn()}
      onDeleteConversation={vi.fn()}
    />,
  );
  return { onOpenContact, user };
}

describe('MobileChatActionsMenu', () => {
  it('exposes secondary chat actions without crowding the mobile header', async () => {
    const { onOpenContact, user } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Más acciones del chat' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ficha del cliente' }));

    expect(onOpenContact).toHaveBeenCalledOnce();
  });
});
