export const DOMESTIC_PDF_STORAGE_PATH = 'brand/limpieza-domestica.pdf';
export const DOMESTIC_PDF_FILENAME = 'Prosavis_Limpieza_Domestica.pdf';

export function snippetAttachesDomesticPdf(shortcut: string): boolean {
  return shortcut.trim().toLowerCase() === '/hogar';
}
