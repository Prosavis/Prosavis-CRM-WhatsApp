import type { WhatsAppTag, WhatsAppTagFolder } from '@/types/whatsapp';

export type TagFolderDisplayItem =
  | { type: 'folder'; folder: WhatsAppTagFolder; tags: WhatsAppTag[] }
  | { type: 'tag'; tag: WhatsAppTag };

function compareTags(a: WhatsAppTag, b: WhatsAppTag): number {
  const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

function compareFolders(a: WhatsAppTagFolder, b: WhatsAppTagFolder): number {
  const orderDiff = a.sortOrder - b.sortOrder;
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

/**
 * Raíz visual: carpetas (con sus tags) y luego tags sin carpeta al mismo nivel.
 * No crea grupo "Sin carpeta" / "Otros".
 */
export function buildTagFolderDisplayItems(
  tags: WhatsAppTag[],
  folders: WhatsAppTagFolder[],
): TagFolderDisplayItem[] {
  const folderIds = new Set(folders.map((f) => f.id));
  const byFolder = new Map<string, WhatsAppTag[]>();
  const rootTags: WhatsAppTag[] = [];

  for (const tag of tags) {
    if (tag.folderId && folderIds.has(tag.folderId)) {
      const list = byFolder.get(tag.folderId) ?? [];
      list.push(tag);
      byFolder.set(tag.folderId, list);
    } else {
      rootTags.push(tag);
    }
  }

  const items: TagFolderDisplayItem[] = [];
  for (const folder of [...folders].sort(compareFolders)) {
    items.push({
      type: 'folder',
      folder,
      tags: (byFolder.get(folder.id) ?? []).sort(compareTags),
    });
  }
  for (const tag of rootTags.sort(compareTags)) {
    items.push({ type: 'tag', tag });
  }
  return items;
}

/** Default: closed. Open if the operator opened it or a tag inside is filtered. */
export function isInboxTagFolderExpanded(options: {
  userOpened?: boolean;
  hasSelectedTag?: boolean;
  defaultExpanded?: boolean;
}): boolean {
  if (options.userOpened === true) return true;
  if (options.hasSelectedTag) return true;
  if (options.userOpened === false) return false;
  return options.defaultExpanded === true;
}

export function normalizeHexColor(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash) && !/^#[0-9A-Fa-f]{3}$/.test(withHash)) {
    return null;
  }
  if (withHash.length === 4) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return withHash.toLowerCase();
}
