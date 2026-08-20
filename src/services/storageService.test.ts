import { describe, expect, it } from 'vitest';
import { formatStorageUploadError } from './storageService';

describe('formatStorageUploadError', () => {
  it('reads message from Error', () => {
    expect(formatStorageUploadError(new Error('JWT expired'))).toBe('JWT expired');
  });

  it('reads message from Storage-like plain objects', () => {
    expect(
      formatStorageUploadError({
        message: 'new row violates row-level security policy',
        statusCode: '403',
        error: 'Unauthorized',
      }),
    ).toBe('new row violates row-level security policy — Unauthorized — 403');
  });

  it('falls back when empty', () => {
    expect(formatStorageUploadError(null)).toBe('No se pudo subir el archivo a Storage.');
  });
});
