import fs from 'node:fs';

const path = 'src/services/whatsappService.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /const \w+Fn = httpsCallable[\s\S]*?\);\n\n/g,
  '',
);

const fnMap = [
  ['patchConversationFn', 'patch-whatsapp-conversation'],
  ['sendChatMessageFn', 'send-whatsapp-chat-message'],
  ['sendReactionFn', 'send-whatsapp-reaction'],
  ['sendMediaBatchFn', 'send-whatsapp-media-batch'],
  ['transcribeAudioFn', 'transcribe-whatsapp-inbound-audio'],
  ['markAsReadFn', 'mark-whatsapp-as-read'],
  ['getMediaUrlFn', 'get-whatsapp-media-url'],
  ['listTemplatesFn', 'list-whatsapp-message-templates'],
  ['sendTemplateAdminFn', 'send-whatsapp-template-message'],
  ['getAutomationSettingFn', 'get-whatsapp-automation-setting'],
  ['setAutomationSettingFn', 'set-whatsapp-automation-setting'],
  ['suggestReplyFn', 'suggest-whatsapp-agent-reply'],
  ['getBookingContextFn', 'get-whatsapp-booking-context'],
  ['getProsavisCleaningWompiCheckoutUrlFn', 'get-prosavis-cleaning-wompi-checkout-url'],
  ['listIATemplatesFn', 'list-whatsapp-ia-templates'],
  ['createIATemplateFn', 'create-whatsapp-ia-template'],
  ['generateIATemplateFn', 'generate-whatsapp-ia-template'],
  ['deleteIATemplateFn', 'delete-whatsapp-ia-template'],
  ['resolveIATemplateFn', 'resolve-whatsapp-ia-template'],
  ['sendQuickReplyFn', 'send-whatsapp-quick-reply'],
  ['bulkSendFn', 'bulk-whatsapp-send'],
  ['ensureConversationFn', 'ensure-whatsapp-conversation-from-lead'],
  ['deleteMessagesFn', 'delete-whatsapp-message-log-entry'],
  ['deleteConversationPermanentlyFn', 'delete-whatsapp-conversation-admin'],
  ['blockUserFn', 'block-whatsapp-user-admin'],
  ['listTagsFn', 'list-whatsapp-tags'],
  ['createTagFn', 'create-whatsapp-tag'],
  ['updateTagFn', 'update-whatsapp-tag'],
  ['deleteTagFn', 'delete-whatsapp-tag'],
  ['assignTagsFn', 'assign-whatsapp-tags'],
  ['listStickersFn', 'list-whatsapp-stickers'],
  ['createStickerFn', 'create-whatsapp-sticker'],
  ['updateStickerFn', 'update-whatsapp-sticker'],
  ['listSnippetsFn', 'list-whatsapp-snippets'],
  ['createSnippetFn', 'create-whatsapp-snippet'],
  ['updateSnippetFn', 'update-whatsapp-snippet'],
  ['deleteSnippetFn', 'delete-whatsapp-snippet'],
  ['getProfileFn', 'get-whatsapp-business-profile'],
  ['updateProfileFn', 'update-whatsapp-business-profile'],
];

for (const [oldName, edgeName] of fnMap) {
  const re = new RegExp(`await ${oldName}\\(`, 'g');
  content = content.replace(re, `await invokeFn('${edgeName}', `);
}

content = content.replace(/const result = await invokeFn/g, 'const data = await invokeFn');
content = content.replace(/return result\.data/g, 'return data');
content = content.replace(/return result\.data\./g, 'return data.');

content = content.replace(
  /export async function patchWhatsAppConversationAdmin\(params: \{[\s\S]*?\}\): Promise<\{ success: boolean \}> \{[\s\S]*?return \{ success: boolean \};\n\}/,
  `export async function patchWhatsAppConversationAdmin(params: {
  conversationId: string;
  patch: Partial<{
    contactName: string | null;
    adminNotes: string | null;
    contactPhotoUrl: string | null;
    whatsappProfileName: string | null;
    automatedInboundDisabled: boolean | null;
    isArchived: boolean;
    isPinned: boolean;
    crmForceUnread: boolean;
    tagIds: string[];
  }>;
}): Promise<{ success: boolean }> {
  const dbPatch: Record<string, unknown> = { ...params.patch };
  if ('contactName' in params.patch) dbPatch.contact_name = params.patch.contactName;
  if ('contactPhotoUrl' in params.patch) dbPatch.contact_photo_url = params.patch.contactPhotoUrl;
  if ('whatsappProfileName' in params.patch) {
    dbPatch.whatsapp_profile_name = params.patch.whatsappProfileName;
  }
  delete dbPatch.contactName;
  delete dbPatch.contactPhotoUrl;
  delete dbPatch.whatsappProfileName;
  await invokeFn('patch-whatsapp-conversation', {
    stableKey: params.conversationId,
    patch: dbPatch,
  });
  return { success: true };
}`,
);

content = content.replace(
  /export async function getWhatsAppAutomationSetting\(\): Promise<\{ geminiInboundEnabled: boolean \}> \{[\s\S]*?\}/,
  `export async function getWhatsAppAutomationSetting(): Promise<{ geminiInboundEnabled: boolean }> {
  const data = await invokeFn<{ enabled?: boolean; geminiInboundEnabled?: boolean }>(
    'get-whatsapp-automation-setting',
  );
  return { geminiInboundEnabled: data.geminiInboundEnabled ?? data.enabled ?? false };
}`,
);

content = content.replace(
  /export async function setWhatsAppAutomationSetting\(enabled: boolean\): Promise<\{ success: boolean \}> \{[\s\S]*?\}/,
  `export async function setWhatsAppAutomationSetting(enabled: boolean): Promise<{ success: boolean }> {
  return invokeFn('set-whatsapp-automation-setting', { enabled, geminiInboundEnabled: enabled });
}`,
);

content = content.replace(
  /export async function getMediaUrl\(mediaId: string\) \{[\s\S]*?return \{ url, mimeType: data\.mimeType, fileSize: data\.fileSize \};\n\}/,
  `export async function getMediaUrl(mediaId: string) {
  const data = await invokeFn<{
    signedUrl?: string;
    storagePath?: string;
    mimeType: string;
    fileSize: number;
  }>('get-whatsapp-media-url', { mediaId });
  if (data.signedUrl) {
    return { url: data.signedUrl, mimeType: data.mimeType, fileSize: data.fileSize };
  }
  if (data.storagePath) {
    const signed = await getWhatsAppMediaSignedUrl({ storagePath: data.storagePath });
    return { url: signed, mimeType: data.mimeType, fileSize: data.fileSize };
  }
  throw new Error('No se pudo resolver URL del medio.');
}`,
);

content = content.replace(
  /export async function listWhatsAppMessageTemplates\(wabaId: string\): Promise<WhatsAppTemplateSummary\[\]> \{[\s\S]*?\}/,
  `export async function listWhatsAppMessageTemplates(wabaId: string): Promise<WhatsAppTemplateSummary[]> {
  const data = await invokeFn<{ templates: WhatsAppTemplateSummary[] }>(
    'list-whatsapp-message-templates',
    { wabaId },
  );
  return data.templates ?? [];
}`,
);

content = content.replace(
  /export async function listWhatsAppIATemplates\(\): Promise<IATemplateSummary\[\]> \{[\s\S]*?\}/,
  `export async function listWhatsAppIATemplates(): Promise<IATemplateSummary[]> {
  const data = await invokeFn<{ templates: IATemplateSummary[] }>('list-whatsapp-ia-templates');
  return data.templates ?? [];
}`,
);

content = content.replace(
  /export async function suggestWhatsAppAgentReply\([\s\S]*?wompiAmountCOP: result\.data\.wompiAmountCOP,\n  \};\n\}/,
  `export async function suggestWhatsAppAgentReply(
  stableKey: string,
  forceGenerate = false,
  includeVoiceTranscriptions = false,
  extraContext?: string,
): Promise<SuggestReplyResult> {
  const data = await invokeFn<SuggestReplyResult>('suggest-whatsapp-agent-reply', {
    stableKey,
    forceGenerate,
    includeVoiceTranscriptions,
    ...(extraContext?.trim() ? { extraContext: extraContext.trim() } : {}),
  });
  return {
    suggestion: data.suggestion ?? null,
    lastMessageIsOutbound: data.lastMessageIsOutbound ?? false,
    hint: data.hint,
    bookingContext: data.bookingContext,
    wompiCheckoutUrl: data.wompiCheckoutUrl,
    wompiPaymentReference: data.wompiPaymentReference,
    wompiAmountCOP: data.wompiAmountCOP,
  };
}`,
);

content = content.replace(
  /export async function getWhatsAppBookingContext\([\s\S]*?wompiAmountCOP: result\.data\.wompiAmountCOP,\n  \};\n\}/,
  `export async function getWhatsAppBookingContext(
  stableKey: string,
  includeVoiceTranscriptions = false,
): Promise<BookingContextResult> {
  const data = await invokeFn<BookingContextResult>('get-whatsapp-booking-context', {
    stableKey,
    includeVoiceTranscriptions,
  });
  return {
    bookingContext: data.bookingContext ?? null,
    wompiCheckoutUrl: data.wompiCheckoutUrl,
    wompiPaymentReference: data.wompiPaymentReference,
    wompiAmountCOP: data.wompiAmountCOP,
  };
}`,
);

// Presence block replacement
content = content.replace(
  /const PRESENCE_COLLECTION = 'whatsapp_admin_presence';[\s\S]*?export function resolveOutboundMediaSpec/,
  `function mapPresenceRow(row: PresenceRow): WhatsAppAdminPresence {
  return {
    uid: row.admin_uid ?? row.id,
    phoneNumberId: row.conversation_stable_key ? null : null,
    conversationId: row.conversation_stable_key,
    displayName: row.admin_email,
    activity: (row.typing ? 'typing' : row.status === 'viewing' ? 'viewing' : 'none') as WhatsAppAdminPresenceActivity,
    updatedAt: toDate(row.last_seen_at),
  };
}

export function subscribeToWhatsAppAdminPresence(
  phoneNumberId: string,
  onNext: (entries: WhatsAppAdminPresence[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let channel: RealtimeChannel | null = null;
  const load = async () => {
    try {
      const { data, error } = await supabase.from('whatsapp_admin_presence').select('*');
      if (error) throw error;
      const now = Date.now();
      const entries = (data ?? [])
        .map(mapPresenceRow)
        .filter((e) => e.updatedAt && now - e.updatedAt.getTime() < PRESENCE_TTL_MS);
      onNext(entries);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };
  void load();
  channel = supabase
    .channel(\`whatsapp-presence:\${phoneNumberId}\`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_admin_presence' },
      () => void load(),
    )
    .subscribe();
  return () => {
    if (channel) void supabase.removeChannel(channel);
  };
}

export async function setMyWhatsAppPresence(
  uid: string,
  partial: Partial<Omit<WhatsAppAdminPresence, 'uid' | 'updatedAt'>>,
): Promise<void> {
  const { error } = await supabase.from('whatsapp_admin_presence').upsert({
    admin_uid: uid,
    conversation_stable_key: partial.conversationId ?? null,
    admin_email: partial.displayName ?? null,
    status: partial.activity === 'typing' ? 'typing' : partial.activity === 'viewing' ? 'viewing' : 'none',
    typing: partial.activity === 'typing',
    last_seen_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearMyWhatsAppPresence(uid: string): Promise<void> {
  try {
    await supabase.from('whatsapp_admin_presence').delete().eq('admin_uid', uid);
  } catch (err) {
    console.warn('[clearMyWhatsAppPresence] delete failed:', err);
  }
}

export async function getWhatsAppMediaSignedUrl(params: {
  mediaAssetId?: string;
  storagePath?: string;
  bucketId?: string;
  expiresIn?: number;
}): Promise<string> {
  const data = await invokeFn<{ signedUrl: string }>('get-whatsapp-media-signed-url', params);
  return data.signedUrl;
}

export async function listWhatsAppMessageLog(filters: {
  days?: number;
  status?: string;
  search?: string;
  phoneNumberId?: string;
  limit?: number;
} = {}): Promise<WhatsAppMessage[]> {
  const rows = await invokeFn<MessageRow[]>('list-whatsapp-message-log', filters);
  return (rows ?? []).map(mapMessageRow);
}

export async function getWhatsAppMetrics(days = 30, phoneNumberId?: string) {
  return invokeFn('get-whatsapp-metrics', { days, phoneNumberId });
}

export async function purgeWhatsAppMessageLog(params: {
  confirmation: string;
  phoneNumberId?: string;
  scope?: 'line' | 'all';
}) {
  return invokeFn('purge-whatsapp-message-log', params);
}

export function resolveOutboundMediaSpec`,
);

fs.writeFileSync(path, content);
console.log('Transformed', path);
