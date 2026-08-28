import { describe, expect, it } from 'vitest';
import {
  CRM_CONTACT_PHOTO_SCHEME,
  assertCrmContactPhotoFile,
  buildCrmContactPhotoPath,
  contactPhotoExtension,
  crmContactPhotoStoragePath,
  isCrmContactPhotoRef,
  toCrmContactPhotoRef,
} from './contactPhotoStorage';

describe('contactPhotoStorage', () => {
  it('round-trips the supabase photo ref', () => {
    const ref = toCrmContactPhotoRef('3116838597/abc.jpg');
    expect(ref).toBe(`${CRM_CONTACT_PHOTO_SCHEME}3116838597/abc.jpg`);
    expect(isCrmContactPhotoRef(ref)).toBe(true);
    expect(crmContactPhotoStoragePath(ref)).toBe('3116838597/abc.jpg');
    expect(isCrmContactPhotoRef('https://example.com/nati.jpg')).toBe(false);
  });

  it('picks a safe extension and path', () => {
    expect(contactPhotoExtension({ type: 'image/png', name: 'x.bmp' })).toBe('png');
    const path = buildCrmContactPhotoPath('+57 311 683 8597', { type: 'image/jpeg', name: 'nati.jpg' });
    expect(path.endsWith('.jpg')).toBe(true);
    expect(path.startsWith('3116838597/')).toBe(true);
  });

  it('rejects unsupported contact photos', () => {
    expect(() => assertCrmContactPhotoFile(new File(['x'], 'x.gif', { type: 'image/gif' }))).toThrow(
      /JPEG, PNG o WebP/,
    );
  });
});
