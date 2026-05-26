/** Emite JSON payload completo a stdout para CallMcpTool. */
import fs from 'fs';
process.stdout.write(fs.readFileSync(process.argv[2], 'utf8'));
