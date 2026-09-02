import {
  isOutboundSentVia,
  type OutboundSentVia,
} from '../../supabase/functions/_shared/outboundSentVia';

export type { OutboundSentVia };

export type AdminSenderProfile = { email?: string | null };

/** Emails canónicos del panel. No usar display_name de Google. */
export const CRM_SENDER_LABEL_BY_EMAIL: Readonly<Record<string, string>> = {
  'oliverafrancy@gmail.com': 'Francy',
  'johislaflaca07@gmail.com': 'Johanna',
  'support@prosavis.com': 'Soporte',
  'admin@prosavis.com': 'Admin Marian',
};

export function labelForCrmEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return CRM_SENDER_LABEL_BY_EMAIL[email.trim().toLowerCase()] ?? null;
}

export type OutboundSenderResolution = {
  kind: OutboundSentVia;
  label: string;
};

export function inferOutboundSentVia(params: {
  sentVia?: string | null;
  senderType?: string | null;
  agentUid?: string | null;
}): OutboundSentVia | null {
  if (isOutboundSentVia(params.sentVia)) return params.sentVia;
  if (params.senderType === 'app') return 'app';
  if (params.senderType === 'system') return 'system';
  if (params.senderType === 'agent' && params.agentUid) return 'crm';
  return null;
}

export function resolveOutboundSenderLabel(params: {
  sentVia?: string | null;
  senderType?: string | null;
  agentUid?: string | null;
  adminById?: ReadonlyMap<string, AdminSenderProfile>;
}): OutboundSenderResolution | null {
  const kind = inferOutboundSentVia(params);
  if (!kind) return null;

  if (kind === 'grok') return { kind, label: 'Grok' };
  if (kind === 'app') return { kind, label: 'Francy · App' };
  if (kind === 'system') return { kind, label: 'Sistema' };

  const admin = params.agentUid ? params.adminById?.get(params.agentUid) : undefined;
  return { kind, label: labelForCrmEmail(admin?.email) ?? 'CRM' };
}

export function shouldShowOutboundSenderChip(params: {
  sentVia?: string | null;
  senderType?: string | null;
  agentUid?: string | null;
}): boolean {
  return inferOutboundSentVia(params) !== null;
}
