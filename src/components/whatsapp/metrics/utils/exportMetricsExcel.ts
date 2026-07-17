import type { Workbook, Worksheet } from 'exceljs';

/**
 * Utilidad compartida para exportar métricas a Excel (.xlsx) bien diseñado.
 *
 * `exceljs` se importa de forma dinámica dentro de `downloadWorkbook` para no
 * inflar el bundle inicial (excepción documentada a la regla de imports: la
 * dependencia solo se carga cuando el usuario pulsa «descargar»).
 */

export type ExcelColumnType =
  | 'text'
  | 'int'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime';

export interface ExcelColumn {
  header: string;
  type?: ExcelColumnType;
  /** Ancho fijo opcional; si se omite se calcula del contenido. */
  width?: number;
}

export type ExcelCell = string | number | Date | null | undefined;

export interface StyledSheetOptions {
  /** Nombre de la pestaña (máx. 31 caracteres, Excel lo trunca). */
  name: string;
  /** Título de marca (banner verde). */
  title: string;
  /** Subtítulo descriptivo bajo el título. */
  subtitle?: string;
  /** Líneas meta (fecha de generación, periodo, filtro…). */
  meta?: string[];
  columns: ExcelColumn[];
  rows: ExcelCell[][];
}

const BRAND_GREEN = 'FF1B5E20';
const HEADER_FILL = 'FF2E7D32';
const SUBTITLE_COLOR = 'FF37474F';
const META_COLOR = 'FF78909C';
const ZEBRA_FILL = 'FFF1F7F2';
const BORDER_COLOR = 'FFD7E3DA';
const WHITE = 'FFFFFFFF';

const NUM_FORMATS: Record<ExcelColumnType, string | undefined> = {
  text: undefined,
  int: '#,##0',
  currency: '"$"#,##0',
  percent: '0.0"%"',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};

function thinBorder() {
  const side = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
  return { top: side, bottom: side, left: side, right: side };
}

function coerceValue(value: ExcelCell, type: ExcelColumnType): ExcelCell {
  if (value == null || value === '') return value ?? null;
  if ((type === 'date' || type === 'datetime') && typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  }
  return value;
}

function displayLength(value: ExcelCell): number {
  if (value == null) return 0;
  if (value instanceof Date) return 16;
  return String(value).length;
}

/** Genera la línea meta estándar «Generado: <fecha/hora es-CO>». */
export function excelGeneratedAtLine(): string {
  return `Generado: ${new Date().toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

/**
 * Añade una hoja estilizada (banner de marca, cabecera congelada, formatos por
 * tipo, zebra striping, bordes finos y autofiltro) al libro.
 */
export function addStyledSheet(wb: Workbook, opts: StyledSheetOptions): Worksheet {
  const { name, title, subtitle, meta = [], columns, rows } = opts;
  const colCount = Math.max(columns.length, 1);
  const ws = wb.addWorksheet(name.slice(0, 31), {
    properties: { defaultRowHeight: 18 },
  });

  let r = 1;

  // Banner de título (verde de marca, texto blanco).
  ws.mergeCells(r, 1, r, colCount);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(r).height = 30;
  r += 1;

  if (subtitle) {
    ws.mergeCells(r, 1, r, colCount);
    const cell = ws.getCell(r, 1);
    cell.value = subtitle;
    cell.font = { name: 'Calibri', size: 11, color: { argb: SUBTITLE_COLOR } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    ws.getRow(r).height = 22;
    r += 1;
  }

  for (const line of meta) {
    ws.mergeCells(r, 1, r, colCount);
    const cell = ws.getCell(r, 1);
    cell.value = line;
    cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: META_COLOR } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    r += 1;
  }

  // Fila espaciadora.
  r += 1;

  const headerRowIndex = r;
  const headerRow = ws.getRow(headerRowIndex);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = {
      vertical: 'middle',
      horizontal:
        col.type && col.type !== 'text' && col.type !== 'date' && col.type !== 'datetime'
          ? 'right'
          : 'left',
    };
    cell.border = thinBorder();
  });
  headerRow.height = 22;
  r += 1;

  rows.forEach((row, rowIdx) => {
    const dataRow = ws.getRow(r);
    const isZebra = rowIdx % 2 === 1;
    columns.forEach((col, i) => {
      const type = col.type ?? 'text';
      const cell = dataRow.getCell(i + 1);
      const value = coerceValue(row[i], type);
      cell.value = value ?? null;
      const numFmt = NUM_FORMATS[type];
      if (numFmt && (typeof value === 'number' || value instanceof Date)) {
        cell.numFmt = numFmt;
      }
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF263238' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          type === 'int' || type === 'currency' || type === 'percent' ? 'right' : 'left',
      };
      if (isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
      }
      cell.border = thinBorder();
    });
    r += 1;
  });

  // Anchos: fijos o calculados del contenido.
  columns.forEach((col, i) => {
    if (col.width) {
      ws.getColumn(i + 1).width = col.width;
      return;
    }
    let max = col.header.length;
    for (const row of rows) {
      max = Math.max(max, displayLength(row[i]));
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 3, 10), 52);
  });

  // Congelar hasta la cabecera + autofiltro sobre el rango de datos.
  ws.views = [{ state: 'frozen', ySplit: headerRowIndex }];
  ws.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: colCount },
  };

  return ws;
}

/**
 * Construye el libro con `build`, escribe el buffer y dispara la descarga.
 * Importa `exceljs` dinámicamente para no inflar el bundle inicial.
 */
export async function downloadWorkbook(
  filename: string,
  build: (wb: Workbook) => void,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Prosavis CRM WhatsApp';
  wb.created = new Date();
  build(wb);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
