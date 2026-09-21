import { directoryPhoneKey } from '@/utils/directoryPhone';

/**
 * PostgREST `max_rows` is 1000. The commercial inbox matches ~6800 directory
 * rows, so one RPC call drops the rest and their tags never reach the list.
 */
export const DIRECTORY_META_CHUNK_SIZE = 800;
const DIRECTORY_META_CONCURRENCY = 4;

export interface DirectoryContactMeta {
  photoUrl?: string;
  displayName?: string;
  tags: string[];
  classification?: string;
}

export interface DirectoryMetaSourceRow {
  phone: string | null;
  phone_key: string | null;
  photo_url: string | null;
  display_name: string | null;
  full_name: string | null;
  tags: string[] | null;
  classification: string | null;
}

export function chunkStrings(items: string[], size: number): string[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('chunk size must be a positive integer');
  }
  const chunks: string[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function directoryMetaFromRows(
  rows: DirectoryMetaSourceRow[],
): Map<string, DirectoryContactMeta> {
  const next = new Map<string, DirectoryContactMeta>();
  for (const row of rows) {
    const key = row.phone_key?.trim() || directoryPhoneKey(row.phone) || null;
    if (!key) continue;
    const displayName = row.display_name?.trim() || row.full_name?.trim() || undefined;
    const photoUrl = row.photo_url?.trim() || undefined;
    const tags = (row.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
    const classification = row.classification?.trim() || undefined;
    const existing = next.get(key);
    if (!existing) {
      next.set(key, { displayName, photoUrl, tags, classification });
      continue;
    }
    const mergedTags = [...existing.tags];
    for (const tag of tags) {
      if (!mergedTags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
        mergedTags.push(tag);
      }
    }
    next.set(key, {
      displayName: existing.displayName || displayName,
      photoUrl: existing.photoUrl || photoUrl,
      tags: mergedTags,
      classification: existing.classification || classification,
    });
  }
  return next;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function fetchDirectoryMetaByPhones(
  phones: string[],
  loadChunk: (phones: string[]) => Promise<DirectoryMetaSourceRow[]>,
  options?: { chunkSize?: number; concurrency?: number },
): Promise<Map<string, DirectoryContactMeta>> {
  const chunkSize = options?.chunkSize ?? DIRECTORY_META_CHUNK_SIZE;
  const concurrency = options?.concurrency ?? DIRECTORY_META_CONCURRENCY;
  const pages = await mapWithConcurrency(
    chunkStrings(phones, chunkSize),
    concurrency,
    loadChunk,
  );
  return directoryMetaFromRows(pages.flat());
}
