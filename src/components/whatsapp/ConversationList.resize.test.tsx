import '@/test/setup';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import ConversationList from './ConversationList';
import type { WhatsAppTabCounts } from '@/utils/whatsappInboxStats';
import type { InboxTagCategoryId } from '@/constants/inboxCategories';

vi.mock('@/hooks/useDirectoryContactMeta', () => ({
  useDirectoryContactMeta: () => ({ metaByPhoneKey: new Map(), ready: true }),
  getDirectoryMetaForConversation: () => undefined,
}));

const emptyTabCounts: WhatsAppTabCounts = {
  last24h: 0,
  all: 0,
  unread: 0,
  archived: 0,
  agendados: 0,
  fueraCobertura: 0,
  trabajo: 0,
  empresas: 0,
};

const emptyCategoryTagIds: Record<InboxTagCategoryId, string[]> = {
  agendados: [],
  fuera_cobertura: [],
  trabajo: [],
  empresas: [],
};

function renderList() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <ConversationList
        conversations={[]}
        tabCounts={emptyTabCounts}
        tagCountsById={{}}
        archivedTagCountsById={{}}
        categoryTagIds={emptyCategoryTagIds}
        selectedId={null}
        onSelect={() => undefined}
      />
    </ThemeProvider>,
  );
}

describe('ConversationList resize handle', () => {
  it('keeps the resize gutter outside the list column so the scrollbar stays usable', () => {
    renderList();

    const list = screen.getByTestId('inbox-conversation-list');
    const handle = screen.getByRole('separator', { name: 'Ancho de la lista de chats' });

    expect(list.contains(handle)).toBe(false);
    expect(list.parentElement?.contains(handle)).toBe(false);
  });
});
