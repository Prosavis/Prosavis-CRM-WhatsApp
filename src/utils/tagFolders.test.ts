import { describe, expect, it } from 'vitest';
import { isInboxTagFolderExpanded } from './tagFolders';

describe('isInboxTagFolderExpanded', () => {
  it('starts collapsed when nobody opened it and no tag is filtered', () => {
    expect(isInboxTagFolderExpanded({})).toBe(false);
    expect(isInboxTagFolderExpanded({ defaultExpanded: false })).toBe(false);
  });

  it('opens when the operator expanded the folder', () => {
    expect(isInboxTagFolderExpanded({ userOpened: true })).toBe(true);
  });

  it('opens when a tag inside is filtered even if the folder was never toggled', () => {
    expect(isInboxTagFolderExpanded({ hasSelectedTag: true })).toBe(true);
    expect(isInboxTagFolderExpanded({ userOpened: false, hasSelectedTag: true })).toBe(true);
  });

  it('stays closed after the operator collapses it when nothing is filtered', () => {
    expect(isInboxTagFolderExpanded({ userOpened: false, hasSelectedTag: false })).toBe(false);
  });

  it('honors defaultExpanded only when there is no override and no filter', () => {
    expect(isInboxTagFolderExpanded({ defaultExpanded: true })).toBe(true);
    expect(isInboxTagFolderExpanded({ defaultExpanded: true, userOpened: false })).toBe(false);
  });
});
