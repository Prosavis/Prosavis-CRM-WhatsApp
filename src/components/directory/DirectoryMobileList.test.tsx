import '@/test/setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DirectoryEntry } from '@/types/lead';
import DirectoryMobileList from './DirectoryMobileList';

vi.mock('@/components/directory/DirectoryClassificationTagPicker', () => ({
  default: () => <span>Clasificación</span>,
}));

const entry = {
  id: 'contact-1',
  fullName: 'Ana Pérez',
  displayName: 'Ana',
  phone: '+573001112233',
  email: 'ana@example.com',
  status: 'active',
  source: 'WHATSAPP_INBOUND',
  tags: ['VIP'],
} as DirectoryEntry;

describe('DirectoryMobileList', () => {
  it('keeps ficha, selection and inbox actions available on a compact card', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const onOpenEntry = vi.fn();
    const onOpenInbox = vi.fn();

    render(
      <DirectoryMobileList
        entries={[entry]}
        loading={false}
        searchTerm=""
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onOpenEntry={onOpenEntry}
        onEntryUpdated={vi.fn()}
        onOpenInbox={onOpenInbox}
        onCreate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana Pérez' }));
    await user.click(screen.getByRole('button', { name: 'Abrir ficha de Ana Pérez' }));
    await user.click(screen.getByRole('button', { name: 'Abrir en inbox: Ana Pérez' }));

    expect(onToggleSelect).toHaveBeenCalledWith('contact-1');
    expect(onOpenEntry).toHaveBeenCalledWith(entry);
    expect(onOpenInbox).toHaveBeenCalledWith('+573001112233', 'Ana Pérez');
  });
});
