import type { InboxSoundLine } from '@/utils/soundPreferences';
import { PLAYBACK_VOLUME, areInboxSoundsEnabled } from '@/utils/soundPreferences';

export type InboxSoundKind = 'inbound' | 'outbound';

const BOT_INBOUND = `${import.meta.env.BASE_URL}assets/audio/WhatsAppSound.mp3`;
const COMMERCIAL_INBOUND = `${import.meta.env.BASE_URL}assets/audio/inbox-commercial-inbound.wav`;
const COMMERCIAL_OUTBOUND = `${import.meta.env.BASE_URL}assets/audio/inbox-commercial-outbound.wav`;

function playFile(src: string): void {
  try {
    const audio = new Audio(src);
    audio.volume = PLAYBACK_VOLUME;
    void audio.play().catch(() => {});
  } catch {
    // Autoplay o archivo ausente: no bloquear el inbox.
  }
}

function playBotOutboundTone(): void {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return;
  try {
    const ctx = new AudioContext();
    const notes = [
      { freq: 523, at: 0, dur: 0.1 },
      { freq: 659, at: 0.1, dur: 0.1 },
      { freq: 784, at: 0.2, dur: 0.15 },
    ];
    for (const note of notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.freq, ctx.currentTime + note.at);
      gain.gain.setValueAtTime(0, ctx.currentTime + note.at);
      gain.gain.linearRampToValueAtTime(PLAYBACK_VOLUME, ctx.currentTime + note.at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.at + note.dur);
      oscillator.start(ctx.currentTime + note.at);
      oscillator.stop(ctx.currentTime + note.at + note.dur);
    }
    window.setTimeout(() => {
      void ctx.close();
    }, 500);
  } catch {
    // Sin AudioContext no hay tono de envío Bot.
  }
}

export function inboxSoundSrc(line: InboxSoundLine, kind: InboxSoundKind): string | null {
  if (line === 'bot' && kind === 'inbound') return BOT_INBOUND;
  if (line === 'commercial' && kind === 'inbound') return COMMERCIAL_INBOUND;
  if (line === 'commercial' && kind === 'outbound') return COMMERCIAL_OUTBOUND;
  return null;
}

export function playInboxSound(line: InboxSoundLine, kind: InboxSoundKind): void {
  if (!areInboxSoundsEnabled(line)) return;
  const src = inboxSoundSrc(line, kind);
  if (src) {
    playFile(src);
    return;
  }
  if (line === 'bot' && kind === 'outbound') {
    playBotOutboundTone();
  }
}
