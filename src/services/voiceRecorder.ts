/**
 * Wrapper sobre `opus-recorder` para grabar **OGG/Opus mono 48 kHz** directamente
 * en el navegador (vía AudioWorklet + WASM). Garantiza un formato aceptado por
 * WhatsApp Cloud API (Meta lista `audio/ogg` con codec OPUS como soportado para
 * notas de voz) y evita los contenedores `audio/mp4` fragmentados que produce
 * `MediaRecorder` en Chromium y que Meta rechaza con `errorCode: 131053
 * (Media upload error)`.
 */
import Recorder from 'opus-recorder';
import encoderWorkerUrl from 'opus-recorder/dist/encoderWorker.min.js?url';

export const VOICE_NOTE_MIME = 'audio/ogg';
export const VOICE_NOTE_EXT = 'ogg';

export interface VoiceRecorderHandle {
  /** Detiene la grabación y devuelve el blob OGG/Opus + duración. */
  stop: () => Promise<{ blob: Blob; durationSeconds: number }>;
  /** Cancela sin emitir blob; libera el micrófono y workers. */
  cancel: () => void;
  /** Marca de tiempo (ms) de inicio para cronómetro externo. */
  startedAt: number;
}

export function isVoiceRecorderSupported(): boolean {
  try {
    return Recorder.isRecordingSupported();
  } catch {
    return false;
  }
}

export async function startVoiceRecording(): Promise<VoiceRecorderHandle> {
  if (!isVoiceRecorderSupported()) {
    throw new Error('El navegador no soporta grabación OGG/Opus (AudioWorklet + WASM).');
  }

  const chunks: Uint8Array[] = [];
  let cancelled = false;

  // Configuración orientada a notas de voz: mono, 48 kHz, ~32 kbps con perfil VOIP.
  // - encoderApplication 2048 = OPUS_APPLICATION_VOIP (mejor para voz).
  // - streamPages true entrega chunks parciales para no bloquear al detener.
  const recorder = new Recorder({
    encoderPath: encoderWorkerUrl,
    encoderBitRate: 32000,
    encoderApplication: 2048,
    encoderSampleRate: 48000,
    numberOfChannels: 1,
    streamPages: true,
    encoderFrameSize: 20,
    resampleQuality: 3,
    mediaTrackConstraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  recorder.ondataavailable = (typedArray) => {
    chunks.push(new Uint8Array(typedArray));
  };

  await recorder.start();
  const startedAt = Date.now();

  const stop = (): Promise<{ blob: Blob; durationSeconds: number }> =>
    new Promise((resolve, reject) => {
      recorder.onstop = () => {
        if (cancelled) {
          reject(new Error('Grabación cancelada'));
          return;
        }
        const blob = new Blob(chunks as BlobPart[], { type: VOICE_NOTE_MIME });
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        resolve({ blob, durationSeconds });
      };
      recorder.onstreamerror = (err) => reject(err);
      try {
        recorder.stop();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('No se pudo detener la grabación'));
      }
    });

  const cancel = () => {
    cancelled = true;
    try {
      // Si está activo, detenemos para liberar el micrófono. El handler `onstop`
      // verá `cancelled` y no producirá blob. Si ya fue detenido, `close()` libera workers.
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      recorder.close();
    } catch {
      // ignore: el navegador ya liberó recursos
    }
  };

  return { stop, cancel, startedAt };
}
