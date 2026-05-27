/**
 * Lee payload JSON y escribe en stdout un objeto listo para CallMcpTool deploy_edge_function.
 * Uso: node deploy-payload-via-callmcp-readfile.mjs <payload.json>
 * El agente debe invocar CallMcpTool con el JSON parseado de stdout.
 */
import fs from 'fs';
import path from 'path';

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error(JSON.stringify({ error: `No existe: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
process.stdout.write(JSON.stringify(args));
