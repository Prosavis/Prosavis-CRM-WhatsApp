import { describe, expect, it } from 'vitest';
import {
  CRM_SENDER_LABEL_BY_EMAIL,
  inferOutboundSentVia,
  resolveOutboundSenderLabel,
  shouldShowOutboundSenderChip,
} from './outboundSenderLabel';

const FRANCY_UID = 'uid-francy';
const JOHANNA_UID = 'uid-johanna';
const SUPPORT_UID = 'uid-support';
const ADMIN_UID = 'uid-admin';
const UNKNOWN_UID = 'uid-unknown';

const adminById = new Map([
  [FRANCY_UID, { email: 'oliverafrancy@gmail.com' }],
  [JOHANNA_UID, { email: 'johislaflaca07@gmail.com' }],
  [SUPPORT_UID, { email: 'support@prosavis.com' }],
  [ADMIN_UID, { email: 'admin@prosavis.com' }],
  [UNKNOWN_UID, { email: 'otra@prosavis.com' }],
]);

describe('CRM_SENDER_LABEL_BY_EMAIL', () => {
  it('maps the four CRM accounts without using Nicolás as a chip', () => {
    expect(CRM_SENDER_LABEL_BY_EMAIL['oliverafrancy@gmail.com']).toBe('Francy');
    expect(CRM_SENDER_LABEL_BY_EMAIL['johislaflaca07@gmail.com']).toBe('Johanna');
    expect(CRM_SENDER_LABEL_BY_EMAIL['support@prosavis.com']).toBe('Soporte');
    expect(CRM_SENDER_LABEL_BY_EMAIL['admin@prosavis.com']).toBe('Admin Marian');
    expect(Object.values(CRM_SENDER_LABEL_BY_EMAIL)).not.toContain('Nicolás');
  });
});

describe('resolveOutboundSenderLabel', () => {
  it('labels CRM accounts from email, not Google display_name', () => {
    expect(
      resolveOutboundSenderLabel({
        sentVia: 'crm',
        agentUid: FRANCY_UID,
        adminById,
      })?.label,
    ).toBe('Francy');
    expect(
      resolveOutboundSenderLabel({
        sentVia: 'crm',
        agentUid: JOHANNA_UID,
        adminById,
      })?.label,
    ).toBe('Johanna');
    expect(
      resolveOutboundSenderLabel({
        sentVia: 'crm',
        agentUid: SUPPORT_UID,
        adminById,
      })?.label,
    ).toBe('Soporte');
    expect(
      resolveOutboundSenderLabel({
        sentVia: 'crm',
        agentUid: ADMIN_UID,
        adminById,
      })?.label,
    ).toBe('Admin Marian');
  });

  it('falls back to CRM when the email is not in the catalog', () => {
    expect(
      resolveOutboundSenderLabel({
        sentVia: 'crm',
        agentUid: UNKNOWN_UID,
        adminById,
      }),
    ).toEqual({ kind: 'crm', label: 'CRM' });
  });

  it('labels Grok, App and Sistema without guessing Coex operators', () => {
    expect(resolveOutboundSenderLabel({ sentVia: 'grok' })).toEqual({
      kind: 'grok',
      label: 'Grok',
    });
    expect(resolveOutboundSenderLabel({ sentVia: 'app' })).toEqual({
      kind: 'app',
      label: 'Francy · App',
    });
    expect(resolveOutboundSenderLabel({ sentVia: 'system' })).toEqual({
      kind: 'system',
      label: 'Sistema',
    });
  });

  it('infers historical rows and hides old agent rows without uid', () => {
    expect(
      inferOutboundSentVia({ senderType: 'app', agentUid: null, sentVia: null }),
    ).toBe('app');
    expect(
      inferOutboundSentVia({ senderType: 'system', sentVia: null }),
    ).toBe('system');
    expect(
      inferOutboundSentVia({
        senderType: 'agent',
        agentUid: FRANCY_UID,
        sentVia: null,
      }),
    ).toBe('crm');
    expect(
      inferOutboundSentVia({
        senderType: 'agent',
        agentUid: null,
        sentVia: null,
      }),
    ).toBeNull();
    expect(
      shouldShowOutboundSenderChip({ senderType: 'agent', agentUid: null }),
    ).toBe(false);
  });

  it('does not hide a CRM panel send', () => {
    expect(
      shouldShowOutboundSenderChip({
        sentVia: 'crm',
        senderType: 'agent',
        agentUid: FRANCY_UID,
      }),
    ).toBe(true);
    expect(
      resolveOutboundSenderLabel({
        sentVia: 'crm',
        senderType: 'agent',
        agentUid: FRANCY_UID,
        adminById,
      })?.label,
    ).toBe('Francy');
  });
});
