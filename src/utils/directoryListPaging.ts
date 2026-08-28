export const DIRECTORY_DEFAULT_PAGE_SIZE = 10;

export const DIRECTORY_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type DirectoryPageSize = (typeof DIRECTORY_PAGE_SIZE_OPTIONS)[number];

/** Al entrar o al cambiar un filtro/KPI, la lista vuelve a la primera página con 10 filas. */
export function directoryPagingAfterFilterChange(): {
  page: number;
  rowsPerPage: typeof DIRECTORY_DEFAULT_PAGE_SIZE;
} {
  return { page: 0, rowsPerPage: DIRECTORY_DEFAULT_PAGE_SIZE };
}
