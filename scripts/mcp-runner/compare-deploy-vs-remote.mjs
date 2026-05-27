import fs from 'fs';

const local = JSON.parse(
  fs.readFileSync(process.argv[2], 'utf8'),
);
const remote = JSON.parse(
  fs.readFileSync(process.argv[3], 'utf8'),
);

const rfiles = remote.files ?? [];
const norm = (n) =>
  n
    .replace(/^\.\.\/_shared\//, 'functions/_shared/')
    .replace(/^index\.ts$/, 'functions/send-whatsapp-media-batch/index.ts');

const rmap = new Map(
  rfiles.map((f) => [f.name, f.content.replace(/\r\n/g, '\n')]),
);

let ok = true;
for (const f of local.files) {
  const key = norm(f.name);
  const lc = f.content.replace(/\r\n/g, '\n');
  const rc = rmap.get(key);
  if (!rc || rc !== lc) {
    console.log('DIFF', f.name, '->', key, 'match', rc === lc, 'remote?', Boolean(rc));
    ok = false;
  }
}
console.log(JSON.stringify({ all_match: ok, remote_version: remote.version ?? null, files: local.files.length }));
