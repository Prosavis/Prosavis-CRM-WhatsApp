import { describe, expect, it } from 'vitest';
import { mapTileLayer } from './mapTiles';

describe('mapTileLayer', () => {
  it('serves Esri canvas tiles without a Carto key', () => {
    const light = mapTileLayer('light');
    const dark = mapTileLayer('dark');

    expect(light.url).toContain('World_Light_Gray_Base');
    expect(dark.url).toContain('World_Dark_Gray_Base');
    expect(light.url).not.toMatch(/cartocdn/i);
    expect(dark.url).not.toMatch(/cartocdn/i);
    expect(light.attribution).toContain('Esri');
    expect(light.attribution).toContain('OpenStreetMap');
    expect(dark.attribution).toBe(light.attribution);
  });
});
