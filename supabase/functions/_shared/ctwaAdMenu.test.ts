import { assertEquals } from 'jsr:@std/assert';
import {
  attachesDomesticPdf,
  ctwaMenuChoiceFromMessage,
  decideCtwaAdMenu,
  messageHasAdReferral,
  type CtwaOutboundRow,
} from './ctwaAdMenu.ts';

const BOT = '1035566289641219';
const OTHER = '1043086062223440';

function human(at: string): CtwaOutboundRow {
  return { sentVia: 'crm', senderType: 'agent', campaignType: 'OTHER', createdAt: at };
}

function menu(at: string): CtwaOutboundRow {
  return { sentVia: 'system', senderType: 'system', campaignType: 'CTWA_MENU', createdAt: at };
}

function route(at: string): CtwaOutboundRow {
  return { sentVia: 'system', senderType: 'system', campaignType: 'CTWA_ROUTE', createdAt: at };
}

Deno.test('only the domestic branch attaches the pdf', () => {
  assertEquals(attachesDomesticPdf('hogar'), true);
  assertEquals(attachesDomesticPdf('empresas'), false);
  assertEquals(attachesDomesticPdf('empleo'), false);
  assertEquals(attachesDomesticPdf('inicio'), false);
});

Deno.test('a new ad click on 312 gets the inicio menu', () => {
  assertEquals(decideCtwaAdMenu({
    phoneNumberId: BOT,
    automatedInboundDisabled: false,
    hasAdReferral: true,
    choice: null,
    outboundsSinceClick: [],
  }), 'inicio');
});

Deno.test('311 and a disabled chat stay quiet', () => {
  assertEquals(decideCtwaAdMenu({
    phoneNumberId: OTHER,
    automatedInboundDisabled: false,
    hasAdReferral: true,
    choice: null,
    outboundsSinceClick: [],
  }), 'none');
  assertEquals(decideCtwaAdMenu({
    phoneNumberId: BOT,
    automatedInboundDisabled: true,
    hasAdReferral: true,
    choice: null,
    outboundsSinceClick: [],
  }), 'none');
});

Deno.test('a human reply or a menu already sent does not repeat inicio', () => {
  assertEquals(decideCtwaAdMenu({
    phoneNumberId: BOT,
    automatedInboundDisabled: false,
    hasAdReferral: true,
    choice: null,
    outboundsSinceClick: [human('2026-10-19T17:00:00Z')],
  }), 'none');
  assertEquals(decideCtwaAdMenu({
    phoneNumberId: BOT,
    automatedInboundDisabled: false,
    hasAdReferral: true,
    choice: null,
    outboundsSinceClick: [menu('2026-10-19T17:00:00Z')],
  }), 'none');
});

Deno.test('free text after the menu is left for a person', () => {
  assertEquals(decideCtwaAdMenu({
    phoneNumberId: BOT,
    automatedInboundDisabled: false,
    hasAdReferral: false,
    choice: null,
    outboundsSinceClick: [menu('2026-10-19T17:00:00Z')],
  }), 'none');
});

Deno.test('the three buttons route once, and a later human reply stops the branch', () => {
  const base = {
    phoneNumberId: BOT,
    automatedInboundDisabled: false,
    hasAdReferral: false,
    outboundsSinceClick: [menu('2026-10-19T17:00:00Z')],
  };
  assertEquals(decideCtwaAdMenu({ ...base, choice: 'domestica' }), 'hogar');
  assertEquals(decideCtwaAdMenu({ ...base, choice: 'empresarial' }), 'empresas');
  assertEquals(decideCtwaAdMenu({ ...base, choice: 'empleo' }), 'empleo');
  assertEquals(decideCtwaAdMenu({
    ...base,
    choice: 'domestica',
    outboundsSinceClick: [menu('2026-10-19T17:00:00Z'), route('2026-10-19T17:01:00Z')],
  }), 'none');
  assertEquals(decideCtwaAdMenu({
    ...base,
    choice: 'domestica',
    outboundsSinceClick: [menu('2026-10-19T17:00:00Z'), human('2026-10-19T17:02:00Z')],
  }), 'none');
});

Deno.test('button id and ad referral are read from the webhook message', () => {
  assertEquals(ctwaMenuChoiceFromMessage({
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: 'ctwa_empleo', title: 'Empleo' } },
  }), 'empleo');
  assertEquals(ctwaMenuChoiceFromMessage({ type: 'text', text: { body: '1' } }), 'domestica');
  assertEquals(ctwaMenuChoiceFromMessage({ type: 'text', text: { body: 'Doméstica' } }), 'domestica');
  assertEquals(ctwaMenuChoiceFromMessage({ type: 'text', text: { body: '2' } }), 'empresarial');
  assertEquals(ctwaMenuChoiceFromMessage({ type: 'text', text: { body: 'empleo' } }), 'empleo');
  assertEquals(ctwaMenuChoiceFromMessage({ type: 'text', text: { body: 'busco empleo' } }), null);
  assertEquals(ctwaMenuChoiceFromMessage({ type: 'text', text: { body: 'quiero la 1' } }), null);
  assertEquals(messageHasAdReferral({
    referral: { source_type: 'ad', source_id: '120250397331720691', ctwa_clid: 'abc' },
  }), true);
  assertEquals(messageHasAdReferral({ text: { body: 'Hola' } }), false);
});
