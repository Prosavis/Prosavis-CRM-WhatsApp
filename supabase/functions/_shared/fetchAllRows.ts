function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error) {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === 'string' && maybe.message) return maybe.message;
  }
  return String(error);
}

/**
 * PostgREST enforce max_rows (~1000). Paginate with .range() until exhausted.
 */
export async function fetchAllRows<T>(
  label: string,
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxPages = 100,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildPage(from, to);
    if (error) throw new Error(`${label}: ${errorMessage(error)}`);
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

export const PROSAVIS_CLEANING_SERVICE_ID_FALLBACK = 'nwEMgpEqVwY3o95u3PNE';

export function resolveCleaningServiceId(): string {
  return Deno.env.get('PROSAVIS_SERVICE_ID')?.trim() || PROSAVIS_CLEANING_SERVICE_ID_FALLBACK;
}
