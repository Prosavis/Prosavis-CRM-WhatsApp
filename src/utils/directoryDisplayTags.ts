const HIDDEN_CLASSIFICATIONS = new Set(['unknown', '']);

export function directoryDisplayTags(params: {
  tags?: string[] | null;
  classification?: string | null;
}): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const raw of params.tags ?? []) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(tag);
  }

  const classification = params.classification?.trim() ?? '';
  if (
    classification &&
    !HIDDEN_CLASSIFICATIONS.has(classification.toLowerCase()) &&
    !seen.has(classification.toLowerCase())
  ) {
    labels.push(classification);
  }

  return labels;
}
