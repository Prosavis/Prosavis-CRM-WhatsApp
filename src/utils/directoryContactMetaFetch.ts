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

export const DIRECTORY_META_REFRESH_MS = 300;

export function directoryPhoneFromChange(row: {
  phone?: unknown;
  phone_key?: unknown;
} | null | undefined): string | null {
  const phoneKey = typeof row?.phone_key === 'string' ? row.phone_key : null;
  const phone = typeof row?.phone === 'string' ? row.phone : null;
  return directoryPhoneKey(phoneKey) || directoryPhoneKey(phone);
}

/** Reemplaza solo los teléfonos refrescados. Si el directorio ya no los tiene, se quitan. */
export function mergePhoneMeta(
  current: Map<string, DirectoryContactMeta>,
  phoneKeys: string[],
  loaded: Map<string, DirectoryContactMeta>,
): Map<string, DirectoryContactMeta> {
  const next = new Map(current);
  for (const key of phoneKeys) {
    const meta = loaded.get(key);
    if (meta) next.set(key, meta);
    else next.delete(key);
  }
  return next;
}

export function createDirectoryChangeBatch(options: {
  debounceMs?: number;
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
  onFlush: (change: { phones: string[] } | { reloadAll: true }) => void;
}) {
  const debounceMs = options.debounceMs ?? DIRECTORY_META_REFRESH_MS;
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(id) };
    });
  let phones = new Set<string>();
  let reloadAll = false;
  let timer: { cancel: () => void } | null = null;
  let disposed = false;

  const flush = () => {
    timer = null;
    if (disposed) return;
    const change = reloadAll ? ({ reloadAll: true } as const) : { phones: [...phones] };
    phones = new Set();
    reloadAll = false;
    if (!('reloadAll' in change) && change.phones.length === 0) return;
    options.onFlush(change);
  };

  return {
    push(phone: string | null) {
      if (disposed) return;
      if (!phone) reloadAll = true;
      else phones.add(phone);
      if (timer) return;
      timer = schedule(flush, debounceMs);
    },
    dispose() {
      disposed = true;
      timer?.cancel();
      timer = null;
      phones = new Set();
      reloadAll = false;
    },
  };
}
