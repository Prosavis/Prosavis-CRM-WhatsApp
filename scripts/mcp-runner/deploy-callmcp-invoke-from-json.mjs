/**
 * Invoca deploy_edge_function vía CallMcpTool leyendo un JSON de argumentos.
 * Uso: node deploy-callmcp-invoke-from-json.mjs <args-json-path>
 * Imprime {name, version} o {name, error} en stdout.
 *
 * Este script NO puede llamar CallMcpTool directamente; emite el payload
 * en stderr y espera que el agente use CallMcpTool con esos argumentos.
 * Si SUPABASE_ACCESS_TOKEN está definido, despliega vía Management API.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.log(JSON.stringify({ error: `Archivo no encontrado: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token) {
  process.stdout.write(JSON.stringify(args));
  process.exit(0);
}

const { project_id, name, entrypoint_path, verify_jwt, files } = args;
const form = new FormData();
form.append('metadata', JSON.stringify({ entrypoint_path, name, verify_jwt }));
for (const file of files) {
  form.append('file', new Blob([file.content], { type: 'text/plain' }), file.name);
}

const url = `https://api.supabase.com/v1/projects/${project_id}/functions/deploy?slug=${encodeURIComponent(name)}`;
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  if (!res.ok) {
    console.log(JSON.stringify({ name, error: body?.message ?? text.slice(0, 500) }));
  } else {
    console.log(JSON.stringify({ name, version: body?.version ?? body?.data?.version ?? null }));
  }
} catch (err) {
  console.log(JSON.stringify({ name, error: String(err.message ?? err) }));
}
