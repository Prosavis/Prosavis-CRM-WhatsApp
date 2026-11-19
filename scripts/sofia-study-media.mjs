// Completa audios, imágenes y documentos que el cliente ya envió.
// Usa las Edge que ya existen. No envía mensajes ni imprime el contenido.

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contextKey = process.env.GROK_INBOX_AI_CONTEXT_KEY;

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: headers() });
  if (!response.ok) throw new Error('No se pudo leer los adjuntos');
  return response.json();
}

async function transcribeBatch() {
  const response = await fetch(`${url}/functions/v1/transcribe-whatsapp-inbound-audio`, {
    method: 'POST',
    headers: headers({ 'x-api-key': contextKey }),
    body: JSON.stringify({ backfill: true, limit: 50 }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { attempted: 0, completed: 0, failed: 1 };
  return {
    attempted: Number(body.attempted) || 0,
    completed: Number(body.completed) || 0,
    failed: Number(body.failed) || 0,
  };
}

async function pendingMedia() {
  const rows = [];
  for (const type of ['image', 'document', 'video']) {
    for (let offset = 0; offset < 5000; offset += 1000) {
      const page = await rest(
        `whatsapp_message_log?select=id,media_type&direction=eq.inbound&media_type=eq.${type}&media_analysis_text=is.null&order=created_at.asc&limit=1000&offset=${offset}`,
      );
      rows.push(...(page ?? []).map((row) => ({ ...row, media_type: type })));
      if (!page || page.length < 1000) break;
    }
  }
  return rows;
}

async function pendingAudios() {
  const rows = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const page = await rest(
      `whatsapp_message_log?select=id&direction=eq.inbound&media_type=eq.audio&voice_transcription=is.null&order=created_at.asc&limit=1000&offset=${offset}`,
    );
    rows.push(...(page ?? []).map((row) => row.id));
    if (!page || page.length < 1000) break;
  }
  return rows;
}

async function transcribeOne(id) {
  const response = await fetch(`${url}/functions/v1/transcribe-whatsapp-inbound-audio`, {
    method: 'POST',
    headers: headers({ 'x-api-key': contextKey }),
    body: JSON.stringify({ messageLogId: id }),
  });
  return response.ok ? 'ok' : 'failed';
}

async function analyzeOne(id) {
  const response = await fetch(`${url}/functions/v1/analyze-whatsapp-inbound-image`, {
    method: 'POST',
    headers: headers({ 'x-api-key': contextKey }),
    body: JSON.stringify({ messageLogId: id }),
  });
  const body = await response.text();
  if (body.includes('cupo de análisis')) return 'cap';
  return response.ok ? 'ok' : 'failed';
}

async function main() {
  if (!key || !contextKey) {
    console.error('Faltan las claves de servicio. No se analizó nada.');
    process.exit(1);
  }
  const audio = { attempted: 0, completed: 0, failed: 0 };
  const audioIds = await pendingAudios();
  for (let index = 0; index < audioIds.length; index += 3) {
    const results = await Promise.all(audioIds.slice(index, index + 3).map((id) => transcribeOne(id)));
    for (const result of results) {
      audio.attempted += 1;
      if (result === 'ok') audio.completed += 1;
      else audio.failed += 1;
    }
  }
  const pending = await pendingMedia();
  const videos = pending.filter((row) => row.media_type === 'video').length;
  let analyzed = 0;
  let failed = 0;
  let stopped = false;
  const ids = pending.filter((row) => row.media_type !== 'video').map((row) => row.id);
  for (let index = 0; index < ids.length && !stopped; index += 3) {
    const results = await Promise.all(ids.slice(index, index + 3).map((id) => analyzeOne(id)));
    for (const result of results) {
      if (result === 'cap') stopped = true;
      else if (result === 'ok') analyzed += 1;
      else failed += 1;
    }
    if (index > 0 && index % 60 === 0) {
      console.log(JSON.stringify({ avance_analizados: analyzed, avance_fallos: failed }));
    }
  }
  console.log(JSON.stringify({
    audios: audio,
    imagenes_y_documentos_analizados: analyzed,
    fallos: failed,
    videos_sin_analizar: videos,
    pendientes: ids.length,
    detenido_por_cupo: stopped,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'falló');
  process.exit(1);
});
