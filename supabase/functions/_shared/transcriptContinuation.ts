export const STT_MAX_OUTPUT_TOKENS = 8192;
export const STT_MAX_CONTINUATIONS = 4;

export function transcriptContinuationAnchor(text: string, wordCount = 40): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(-Math.max(1, wordCount)).join(' ');
}

export function stitchTranscriptContinuation(previous: string, next: string): string {
  const prev = previous.trim();
  const extra = next.trim();
  if (!prev) return extra;
  if (!extra) return prev;
  if (extra.startsWith(prev)) return extra;

  const prevWords = prev.split(/\s+/).filter(Boolean);
  const extraWords = extra.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(prevWords.length, extraWords.length, 20);
  for (let n = maxOverlap; n >= 2; n -= 1) {
    const suffix = prevWords.slice(-n).join(' ');
    const prefix = extraWords.slice(0, n).join(' ');
    if (suffix === prefix) {
      return `${prevWords.join(' ')} ${extraWords.slice(n).join(' ')}`.trim();
    }
  }
  return `${prev}\n${extra}`.trim();
}

export function shouldReuseCachedTranscript(
  row: { voice_transcription?: unknown; voice_transcription_status?: unknown },
  force?: boolean,
): boolean {
  if (force) return false;
  const status = String(row.voice_transcription_status ?? '').trim();
  return Boolean(row.voice_transcription) && status === 'completed';
}
