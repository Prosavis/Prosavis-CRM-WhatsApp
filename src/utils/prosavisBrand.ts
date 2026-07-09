export const PROSAVIS_LOGO_LIGHT = '/assets/icons/iconoProsavisClean.png';
export const PROSAVIS_LOGO_DARK = '/assets/icons/iconProsavisNaranjaClean.png';

export function getProsavisLogoSrc(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? PROSAVIS_LOGO_DARK : PROSAVIS_LOGO_LIGHT;
}
