import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines';
import {
  applyWhatsAppFocusChat,
  applyWhatsAppTab,
  buildWhatsAppInboxSearch,
  conversationBelongsToLineFilter,
  normalizeWhatsAppSearchParams,
  preferConversationForFilter,
  resolveWhatsAppLineFilter,
  resolveWhatsAppTabKey,
  whatsappInboxHref,
  whatsappTabFromIndex,
  whatsappTabIndex,
} from './whatsappTabs';

describe('whatsappTabs', () => {
  it('uses Citas 312 as the default inbox tab', () => {
    const search = new URLSearchParams();
    expect(resolveWhatsAppTabKey(search)).toBe('inbox');
    expect(resolveWhatsAppLineFilter(search)).toBe('bot');
    expect(whatsappTabIndex('inbox')).toBe(0);
    expect(whatsappTabFromIndex(1)).toBe('commercial');
  });

  it('opens Comercial 311 from the canonical tab query', () => {
    const search = new URLSearchParams('tab=commercial');
    expect(resolveWhatsAppTabKey(search)).toBe('commercial');
    expect(resolveWhatsAppLineFilter(search)).toBe('commercial');
  });

  it('normalizes the legacy line=commercial URL into the commercial tab', () => {
    const { next, changed } = normalizeWhatsAppSearchParams(
      new URLSearchParams('line=commercial&conversation=573146283332__1043086062223440'),
    );
    expect(changed).toBe(true);
    expect(next.get('tab')).toBe('commercial');
    expect(next.get('line')).toBeNull();
    expect(next.get('conversation')).toBe('573146283332__1043086062223440');
    expect(resolveWhatsAppTabKey(next)).toBe('commercial');
  });

  it('keeps line=all as a hidden diagnostic view on Citas', () => {
    const search = new URLSearchParams('line=all');
    expect(resolveWhatsAppTabKey(search)).toBe('inbox');
    expect(resolveWhatsAppLineFilter(search)).toBe('all');
    const next = applyWhatsAppTab(search, 'inbox');
    expect(next.get('tab')).toBeNull();
    expect(next.get('line')).toBe('all');
  });

  it('clears leftover commercial line params when switching to Citas', () => {
    const next = applyWhatsAppTab(new URLSearchParams('tab=commercial&line=commercial'), 'inbox');
    expect(next.get('tab')).toBeNull();
    expect(next.get('line')).toBeNull();
  });

  it('opens a commercial notification on the commercial tab', () => {
    const next = applyWhatsAppFocusChat(new URLSearchParams('tab=metrics'), {
      phone: '573146283332',
      conversationId: '573146283332__1043086062223440',
      phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
    });
    expect(next.get('tab')).toBe('commercial');
    expect(next.get('conversation')).toBe('573146283332__1043086062223440');
    expect(next.get('focusPhone')).toBe('573146283332');
    expect(whatsappInboxHref({
      phone: '573146283332',
      conversationId: '573146283332__1043086062223440',
    })).toBe(
      '/whatsapp?tab=commercial&conversation=573146283332__1043086062223440&focusPhone=573146283332',
    );
  });

  it('keeps a plain phone on the bot inbox', () => {
    const search = buildWhatsAppInboxSearch({
      phone: '573146283332',
      conversationId: '573146283332',
    });
    expect(search.get('tab')).toBeNull();
    expect(search.get('conversation')).toBe('573146283332');
  });

  it('isolates bot and commercial conversations in each list', () => {
    const bot = { id: '573146283332', phoneNumberId: '1035566289641219' };
    const commercial = {
      id: '573146283332__1043086062223440',
      phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
    };
    expect(conversationBelongsToLineFilter(bot, 'bot')).toBe(true);
    expect(conversationBelongsToLineFilter(commercial, 'bot')).toBe(false);
    expect(conversationBelongsToLineFilter(commercial, 'commercial')).toBe(true);
    expect(conversationBelongsToLineFilter(bot, 'commercial')).toBe(false);
    expect(conversationBelongsToLineFilter(bot, 'all')).toBe(true);
    expect(preferConversationForFilter([bot, commercial], 'bot')?.id).toBe(bot.id);
    expect(preferConversationForFilter([bot, commercial], 'commercial')?.id).toBe(commercial.id);
    expect(preferConversationForFilter([bot], 'commercial')).toBeUndefined();
    expect(preferConversationForFilter([commercial], 'bot')).toBeUndefined();
  });

  it('normalizes a commercial conversation key even without tab=', () => {
    const { next, changed } = normalizeWhatsAppSearchParams(
      new URLSearchParams('conversation=573146283332__1043086062223440'),
    );
    expect(changed).toBe(true);
    expect(next.get('tab')).toBe('commercial');
    expect(resolveWhatsAppTabKey(next)).toBe('commercial');
  });
});
