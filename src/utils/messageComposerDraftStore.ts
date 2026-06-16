const drafts = new Map<string, string>();

export function getComposerDraft(conversationKey: string): string {
  if (!conversationKey) return '';
  return drafts.get(conversationKey) ?? '';
}

export function setComposerDraft(conversationKey: string, text: string): void {
  if (!conversationKey) return;
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    drafts.delete(conversationKey);
    return;
  }
  drafts.set(conversationKey, text);
}

export function clearComposerDraft(conversationKey: string): void {
  if (!conversationKey) return;
  drafts.delete(conversationKey);
}

export function clearAllComposerDrafts(): void {
  drafts.clear();
}
