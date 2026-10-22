/**
 * Tres tomas de Sofía por guion (menú, doméstica, empresarial).
 * El texto tiene que coincidir con CTWA_VOICE_NUDGE_SCRIPT en
 * supabase/functions/_shared/ctwaVoiceNudge.ts.
 *
 * Clave: ELEVENLABS_API_KEY en publicidad/.env.
 * Uso: node scripts/generate-ctwa-voice-nudges.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'audio', 'ctwa-voice-nudges');
const VOICE_ID = 'b2htR0pMe28pYwCY9gnP';
const MODEL = 'eleven_v4';
const TAKES = [
  { take: 1, seed: 11, stability: 0.45 },
  { take: 2, seed: 22, stability: 0.55 },
  { take: 3, seed: 33, stability: 0.65 },
];

const SCRIPTS = {
  menu: 'Hola, buenas. Te habla Sofía, de Prosavis. Vi que nos escribiste y quiero ayudarte de una. Cuéntame qué necesitas: una limpieza para tu casa, para tu empresa, o si estás buscando empleo. Y regálame tu nombre, por favor, para guardarte y atenderte de forma más personalizada. Si quieres que te llamemos a otro número, también me lo dejas por aquí.',
  hogar: 'Hola, soy Sofía otra vez. Te acabo de dejar la información de la limpieza para tu casa. Si te sirve, regálame tu nombre, el municipio y el día que la necesitas, y te dejamos el cupo.',
  empresas: 'Hola, soy Sofía otra vez. Te dejé la información de limpieza para empresas. Cuéntame qué espacio es, en qué municipio queda, y tu nombre, y te armamos la cotización.',
};

async function loadApiKey() {
  if (process.env.ELEVENLABS_API_KEY?.trim()) return process.env.ELEVENLABS_API_KEY.trim();
  const envPath = path.resolve(__dirname, '..', '..', 'publicidad', '.env');
  const env = await readFile(envPath, 'utf8').catch(() => '');
  const match = env.match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!match?.[1]?.trim()) throw new Error('Falta ELEVENLABS_API_KEY en publicidad/.env');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

async function synthesize(apiKey, text, take) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      language_code: 'es',
      seed: take.seed,
      voice_settings: {
        stability: take.stability,
        similarity_boost: 0.8,
        style: 0,
        use_speaker_boost: true,
      },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`ElevenLabs HTTP ${response.status} (${take.seed}): ${detail}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('ElevenLabs no devolvió audio.');
  return {
    bytes,
    characterCost: response.headers.get('character-cost'),
  };
}

async function main() {
  const apiKey = await loadApiKey();
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const [kind, text] of Object.entries(SCRIPTS)) {
    for (const take of TAKES) {
      const result = await synthesize(apiKey, text, take);
      const filename = `${kind}-take-${take.take}.mp3`;
      await writeFile(path.join(OUT_DIR, filename), result.bytes);
      manifest.push({
        kind,
        take: take.take,
        seed: take.seed,
        stability: take.stability,
        bytes: result.bytes.length,
        characterCost: result.characterCost,
        filename,
      });
      process.stdout.write(`${filename} ${result.bytes.length}\n`);
    }
  }
  await writeFile(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
