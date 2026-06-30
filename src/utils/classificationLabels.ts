/**
 * Etiquetas visuales para clasificación del directorio (tags WhatsApp + legacy).
 */

const LEGACY_LABELS: Record<string, string> = {
  company: 'Empresa',
  user: 'Usuario',
  lead: 'Prospecto',
  unknown: 'Sin clasificar',
  agendado: 'Agendado',
};

export function getClassificationLabel(classification?: string | null): string {
  if (!classification) return 'Sin clasificar';

  const tags = classification.split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length > 1) return classification;

  const lower = classification.toLowerCase().trim();
  return LEGACY_LABELS[lower] ?? classification;
}

export function tagNamesToIds(
  tagNames: string[],
  catalog: Array<{ id: string; name: string }>
): string[] {
  const nameSet = new Set(tagNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  return catalog
    .filter((t) => nameSet.has(t.name.trim().toLowerCase()))
    .map((t) => t.id);
}
