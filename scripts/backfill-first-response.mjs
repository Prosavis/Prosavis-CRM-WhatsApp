// Reconstruye episodios de primera respuesta. Solo llama un RPC de lectura y escritura
// interna. No envía WhatsApp ni toca la línea 311 como canal de salida.

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const limit = Number(process.env.BACKFILL_LIMIT || 100);
let guard = 0;
while (guard < 5000) {
  guard += 1;
  const response = await fetch(`${url}/rest/v1/rpc/backfill_whatsapp_response_episodes`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_limit: limit }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(body);
    process.exit(1);
  }
  console.log(JSON.stringify(body));
  if (!body.quedan) break;
}
