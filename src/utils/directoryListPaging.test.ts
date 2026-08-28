import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_DEFAULT_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE_OPTIONS,
  directoryPagingAfterFilterChange,
} from './directoryListPaging';

describe('directoryListPaging', () => {
  it('defaults to 10 rows and keeps larger page-size options', () => {
    expect(DIRECTORY_DEFAULT_PAGE_SIZE).toBe(10);
    expect(DIRECTORY_PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100]);
  });

  it('resets to page 0 and 10 rows when a filter or KPI changes', () => {
    expect(directoryPagingAfterFilterChange()).toEqual({ page: 0, rowsPerPage: 10 });
  });
});
