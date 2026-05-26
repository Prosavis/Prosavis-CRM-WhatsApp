import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { firebaseIdToUuid } from './lib/id-mapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const docs: [string, string][] = [
  ['4H4tKoEdtgHpo0sIzmGC', 'Seguimiento sin reserva'],
  ['8VNfn2MnupR9AtQweQS5', 'Agradecimiento'],
  ['D0k8ZGD2CeByZVOBu63c', 'Promoción especial'],
  ['fxDkvMUbYcCj48HEsO1n', 'Programa de referidos'],
  ['GyObWAkKb07kbNVEGUvu', 'Bienvenida'],
  ['LZkF3UH136RE0A4Pb5tN', 'Información del servicio'],
  ['NW8QYFjnWZFg25s3cbvI', 'Recordatorio de cita'],
  ['NWgeG8FRn29mxC6W0BU7', 'Información del servicio'],
  ['nwR7N6F9FMgook6t3jKB', 'Bienvenida'],
  ['o4r6t5JAH9BpvLROF741', 'Precios del servicio'],
  ['q31zMh3LDyOYIqRsGhRd', 'Precios del servicio'],
  ['riioNp4E7AXmtx66MROd', 'Seguimiento sin reserva'],
  ['tXe6jKd1hUJPe9NTQfPM', 'Promoción especial'],
  ['uAbOFLX1Hj5RDr7bJwa6', 'Post-servicio'],
  ['vE8kfSMj2vy0PBGozhVt', 'Recordatorio de cita'],
  ['XFNXvqaQl2iLzXbCrEIg', 'Reactivación'],
  ['Y1QRQHf6oV15BF0iZNM3', 'Programa de referidos'],
  ['yoKfF83r7B4pXhVx5AJu', 'Agradecimiento'],
  ['YziTmNnxpbb1vTrayH4g', 'Reactivación'],
  ['ZMX76Vz3Tqeu0RwCgsVq', 'Post-servicio'],
];

const esc = (s: string) => s.replace(/'/g, "''");
const sql = docs
  .map(([fid, label]) => {
    const id = firebaseIdToUuid('whatsapp_ia_templates', fid);
    return `UPDATE whatsapp_ia_templates SET name = '${esc(label)}', updated_at = NOW() WHERE id = '${id}' AND name = '${esc(fid)}';`;
  })
  .join('\n');

const out = path.join(__dirname, '..', '.edge-deploy', '_repair-template-names.sql');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, sql);
console.log(out);
console.log(sql);
