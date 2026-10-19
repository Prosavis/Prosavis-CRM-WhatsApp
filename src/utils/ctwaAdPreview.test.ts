import { describe, expect, it } from 'vitest';
import { ctwaAdName, ctwaAdPreviewFromPayload } from './ctwaAdPreview';

describe('ctwaAdPreview', () => {
  it('names the four live WhatsApp ads', () => {
    expect(ctwaAdName('120250397331720691')).toBe('Glamping');
    expect(ctwaAdName('120250397333590691')).toBe('Cerritos clara');
    expect(ctwaAdName('120250397337640691')).toBe('Joven lujo');
    expect(ctwaAdName('120250397340930691')).toBe('Señora');
    expect(ctwaAdName('otro')).toBeUndefined();
  });

  it('reads the ad click stored on the inbound message', () => {
    const preview = ctwaAdPreviewFromPayload({
      referral: {
        source_type: 'ad',
        source_id: '120250397331720691',
        headline: 'Reserva por WhatsApp',
        body: 'Tu casa impecable',
        image_url: 'https://cdn.example/glamping.jpg',
      },
    });
    expect(preview).toEqual({
      sourceId: '120250397331720691',
      name: 'Glamping',
      headline: 'Reserva por WhatsApp',
      body: 'Tu casa impecable',
      imageUrl: 'https://cdn.example/glamping.jpg',
    });
  });

  it('keeps headline and image when the ad id is not in the map', () => {
    const preview = ctwaAdPreviewFromPayload({
      referral: { source_id: '999', headline: 'Otro', image_url: 'https://cdn.example/x.jpg' },
    });
    expect(preview?.name).toBeUndefined();
    expect(preview?.headline).toBe('Otro');
    expect(preview?.imageUrl).toBe('https://cdn.example/x.jpg');
  });

  it('ignores a message that is not an ad click', () => {
    expect(ctwaAdPreviewFromPayload({ text: { body: 'Hola' } })).toBeNull();
    expect(
      ctwaAdPreviewFromPayload({ referral: { source_type: 'post', source_id: '1' } }),
    ).toBeNull();
  });
});
