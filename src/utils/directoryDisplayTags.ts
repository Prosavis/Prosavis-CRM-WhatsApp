const HIDDEN_CLASSIFICATIONS = new Set(['unknown', '']);

export function catalogColorByTagName(
  tags: Array<{ name?: string | null; color?: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    const key = (tag.name ?? '').trim().toLowerCase();
    const color = (tag.color ?? '').trim();
    if (!key || !color || map.has(key)) continue;
    map.set(key, color);
  }
  return map;
}

export function directoryTagColor(
  label: string,
  colorByName: Map<string, string>,
): string | undefined {
  return colorByName.get(label.trim().toLowerCase());
}

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

  if (labels.length > 0) return labels;

  const classification = params.classification?.trim() ?? '';
  if (
    !classification ||
    classification.includes(',') ||
    HIDDEN_CLASSIFICATIONS.has(classification.toLowerCase())
  ) {
    return labels;
  }

  return [classification];
}
