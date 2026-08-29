import { assertEquals } from 'jsr:@std/assert';
import {
  shouldReuseCachedTranscript,
  stitchTranscriptContinuation,
  transcriptContinuationAnchor,
} from './transcriptContinuation.ts';

Deno.test('anchor keeps the last words', () => {
  assertEquals(transcriptContinuationAnchor('uno dos tres cuatro', 2), 'tres cuatro');
});

Deno.test('stitches continuation without repeating the overlap', () => {
  const stitched = stitchTranscriptContinuation(
    'Hola buenos días cómo está',
    'cómo está el servicio de mañana',
  );
  assertEquals(stitched.includes('Hola buenos días'), true);
  assertEquals(stitched.includes('el servicio de mañana'), true);
  assertEquals((stitched.match(/cómo está/g) ?? []).length, 1);
});

Deno.test('cache only reuses a completed full transcript', () => {
  assertEquals(
    shouldReuseCachedTranscript({ voice_transcription: 'hola', voice_transcription_status: 'completed' }),
    true,
  );
  assertEquals(
    shouldReuseCachedTranscript({ voice_transcription: 'hola', voice_transcription_status: 'partial' }),
    false,
  );
  assertEquals(
    shouldReuseCachedTranscript(
      { voice_transcription: 'hola', voice_transcription_status: 'completed' },
      true,
    ),
    false,
  );
});
