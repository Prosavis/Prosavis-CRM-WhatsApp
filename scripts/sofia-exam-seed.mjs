// Siembra el examen fijo. No llama a un modelo y no imprime chats.

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const version = Number(process.argv[2] || '2');

const response = await fetch(`${url}/rest/v1/rpc/sofia_exam_seed`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p_version: version }),
});

if (!response.ok) {
  const detail = await response.text();
  console.log(JSON.stringify({ error: response.status, detalle: detail.slice(0, 300) }));
  process.exit(1);
}

console.log(JSON.stringify(await response.json()));
