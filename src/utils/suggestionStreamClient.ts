export interface SuggestionStreamEvent {
  event: 'delta' | 'done' | 'error';
  data: unknown;
}

export async function readSuggestionStream(
  response: Response,
  onDelta?: (text: string) => void,
): Promise<unknown> {
  if (!response.ok) {
    throw new Error('No se pudo generar la sugerencia');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    return response.json() as Promise<unknown>;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload: unknown = null;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const parsed = parseSuggestionSseBlock(block);
      if (!parsed) continue;
      if (parsed.event === 'error') {
        throw new Error('No se pudo generar la sugerencia');
      }
      if (parsed.event === 'delta') {
        const text = readDeltaText(parsed.data);
        if (text != null) onDelta?.(text);
      }
      if (parsed.event === 'done') donePayload = parsed.data;
    }
  }

  if (!donePayload || typeof donePayload !== 'object') {
    throw new Error('La sugerencia no terminó');
  }
  return donePayload;
}

function readDeltaText(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('text' in data)) return null;
  const text = (data as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}

export function parseSuggestionSseBlock(block: string): SuggestionStreamEvent | null {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const data = JSON.parse(dataLines.join('\n')) as unknown;
  if (event !== 'delta' && event !== 'done' && event !== 'error') return null;
  return { event, data };
}
