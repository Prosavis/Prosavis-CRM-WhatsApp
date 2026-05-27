import fs from 'fs';
import path from 'path';

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error(JSON.stringify({ error: `No existe: ${jsonPath}` }));
  process.exit(1);
}
const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
if (args.files?.[0]?.content) {
  args.files[0].content = args.files[0].content.replace(/^\uFEFF/, '');
}
process.stdout.write(JSON.stringify(args));
