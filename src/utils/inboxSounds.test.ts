import { describe, expect, it } from 'vitest';
import { inboxSoundSrc } from './inboxSounds';

describe('inboxSoundSrc', () => {
  it('keeps the current WhatsApp chime for Inbox Bot inbound', () => {
    expect(inboxSoundSrc('bot', 'inbound')).toContain('WhatsAppSound.mp3');
  });

  it('uses distinct commercial files for inbound and outbound', () => {
    const inbound = inboxSoundSrc('commercial', 'inbound');
    const outbound = inboxSoundSrc('commercial', 'outbound');
    expect(inbound).toContain('inbox-commercial-inbound.wav');
    expect(outbound).toContain('inbox-commercial-outbound.wav');
    expect(inbound).not.toBe(outbound);
  });

  it('does not reuse the bot inbound file for commercial alerts', () => {
    expect(inboxSoundSrc('commercial', 'inbound')).not.toContain('WhatsAppSound.mp3');
    expect(inboxSoundSrc('bot', 'outbound')).toBeNull();
  });
});
