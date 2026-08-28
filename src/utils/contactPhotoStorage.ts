import { directoryPhoneKey } from './directoryPhone';

export const CRM_CONTACT_PHOTOS_BUCKET = 'crm-contact-photos';
export const CRM_CONTACT_PHOTO_SCHEME = 'supabase://crm-contact-photos/';
export const CRM_CONTACT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CRM_CONTACT_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function isCrmContactPhotoRef(value: string | null | undefined): boolean {
  return Boolean(value?.trim().startsWith(CRM_CONTACT_PHOTO_SCHEME));
}

export function crmContactPhotoStoragePath(value: string): string {
  return value.trim().slice(CRM_CONTACT_PHOTO_SCHEME.length).replace(/^\/+/, '');
}

export function toCrmContactPhotoRef(storagePath: string): string {
  return `${CRM_CONTACT_PHOTO_SCHEME}${storagePath.replace(/^\/+/, '')}`;
}

export function contactPhotoExtension(file: Pick<File, 'type' | 'name'>): string {
  const mime = file.type.trim().toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  const fromName = file.name.split('.').pop()?.trim().toLowerCase();
  if (fromName === 'png' || fromName === 'webp' || fromName === 'jpg' || fromName === 'jpeg') {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return 'jpg';
}

export function assertCrmContactPhotoFile(file: File): void {
  const mime = file.type.trim().toLowerCase();
  if (!(CRM_CONTACT_PHOTO_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new Error('La foto debe ser JPEG, PNG o WebP.');
  }
  if (file.size > CRM_CONTACT_PHOTO_MAX_BYTES) {
    throw new Error('La foto no puede superar 5 MB.');
  }
}

export function buildCrmContactPhotoPath(phone: string, file: Pick<File, 'type' | 'name'>): string {
  const key = directoryPhoneKey(phone) || 'unknown';
  const ext = contactPhotoExtension(file);
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return `${key}/${id}.${ext}`;
}
