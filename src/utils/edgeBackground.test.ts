import { describe, expect, it } from 'vitest';
import { scheduleBackgroundWork } from '../../supabase/functions/_shared/edgeBackground';

describe('scheduleBackgroundWork', () => {
  it('returns without waiting for the background promise', () => {
    let finished = false;
    const hang = new Promise<void>((resolve) => {
      setTimeout(() => {
        finished = true;
        resolve();
      }, 30_000);
    });

    scheduleBackgroundWork(hang, 'auto-stt');
    expect(finished).toBe(false);
  });
});
