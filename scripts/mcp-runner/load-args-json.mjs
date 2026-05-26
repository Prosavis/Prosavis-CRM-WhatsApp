import fs from 'fs';
const p = process.argv[2];
if (!p) process.exit(1);
process.stdout.write(fs.readFileSync(p, 'utf8'));
