import '@/test/setup';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentHeatmapResult } from '@/types/whatsapp';
import HeatmapSection from './HeatmapSection';

const { mapSpy, tileLayerSpy } = vi.hoisted(() => {
  const createMap = () => ({
    remove: vi.fn(),
    hasLayer: vi.fn(() => false),
    removeLayer: vi.fn(),
    fitBounds: vi.fn(),
    setView: vi.fn(),
    panTo: vi.fn(),
    invalidateSize: vi.fn(),
  });
  return {
    mapSpy: vi.fn(() => createMap()),
    tileLayerSpy: vi.fn<(url: string, options: { attribution?: string }) => {
      addTo: ReturnType<typeof vi.fn>;
      removeFrom: ReturnType<typeof vi.fn>;
    }>(() => ({
      addTo: vi.fn().mockReturnThis(),
      removeFrom: vi.fn(),
    })),
  };
});

vi.mock('leaflet', () => ({
  map: mapSpy,
  tileLayer: tileLayerSpy,
  heatLayer: vi.fn(() => ({
    addTo: vi.fn().mockReturnThis(),
  })),
  layerGroup: vi.fn(() => ({
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
  })),
  latLngBounds: vi.fn(() => ({
    isValid: () => true,
    pad: () => ({}),
  })),
  circleMarker: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    getElement: () => null,
  })),
}));

vi.mock('leaflet.heat', () => ({}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

const heatmapData: AppointmentHeatmapResult = {
  source: 'gps',
  coverage: {
    total: 70,
    withGps: 33,
    withAddressOnly: 7,
    withoutPoint: 30,
  },
  points: [
    {
      id: 'apt-1',
      lat: 4.8133,
      lng: -75.6961,
      source: 'gps',
      layer: 'recurring',
      status: 'COMPLETED',
      scheduledStart: '2026-08-13T15:00:00.000Z',
    },
  ],
};

const noop = () => undefined;

describe('HeatmapSection', () => {
  beforeEach(() => {
    mapSpy.mockClear();
    tileLayerSpy.mockClear();
  });

  it('creates the map after the first load reveals the container', () => {
    const { rerender } = render(
      <HeatmapSection
        loading
        preferGps
        status="all"
        layer="all"
        mode="density"
        periodLabel="2026-08-09 – 2026-09-07"
        onPreferGpsChange={noop}
        onStatusChange={noop}
        onLayerChange={noop}
        onModeChange={noop}
      />,
    );

    expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
    expect(mapSpy).not.toHaveBeenCalled();

    rerender(
      <HeatmapSection
        data={heatmapData}
        loading={false}
        preferGps
        status="all"
        layer="all"
        mode="density"
        periodLabel="2026-08-09 – 2026-09-07"
        onPreferGpsChange={noop}
        onStatusChange={noop}
        onLayerChange={noop}
        onModeChange={noop}
      />,
    );

    expect(screen.getByRole('region', { name: /Mapa de 1 citas/ })).toBeInTheDocument();
    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(tileLayerSpy).toHaveBeenCalledWith(
      expect.stringContaining('World_Light_Gray_Base'),
      expect.objectContaining({ attribution: expect.stringContaining('Esri') }),
    );
    const firstTileUrl = tileLayerSpy.mock.calls.at(0)?.[0];
    expect(typeof firstTileUrl).toBe('string');
    expect(String(firstTileUrl)).not.toMatch(/cartocdn/i);
  });
});
