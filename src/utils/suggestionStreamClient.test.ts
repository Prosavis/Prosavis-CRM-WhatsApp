import { describe, expect, it, vi } from 'vitest';
import { parseSuggestionSseBlock, readSuggestionStream } from './suggestionStreamClient';

describe('parseSuggestionSseBlock', () => {
  it('reads delta and done events', () => {
    expect(parseSuggestionSseBlock('event: delta\ndata: {"text":"Hola"}')).toEqual({
      event: 'delta',
      data: { text: 'Hola' },
    });
    expect(parseSuggestionSseBlock('event: done\ndata: {"suggestion":"Hola"}')).toEqual({
      event: 'done',
      data: { suggestion: 'Hola' },
    });
  });

  it('emits deltas and returns the done payload', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: delta\ndata: {"text":"Ho"}\n\n',
      'event: delta\ndata: {"text":"Hola"}\n\nevent: done\ndata: {"suggestion":"Hola"}\n\n',
    ];
    const response = new Response(new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const onDelta = vi.fn();
    await expect(readSuggestionStream(response, onDelta)).resolves.toEqual({ suggestion: 'Hola' });
    expect(onDelta).toHaveBeenNthCalledWith(1, 'Ho');
    expect(onDelta).toHaveBeenNthCalledWith(2, 'Hola');
  });
});
