export type MapTileMode = 'light' | 'dark';

export interface MapTileLayerSpec {
  url: string;
  attribution: string;
  maxZoom: number;
}

const ESRI_CANVAS = {
  light:
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark:
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
} as const;

const TILE_ATTRIBUTION = '© OpenStreetMap © Esri';

export function mapTileLayer(mode: MapTileMode): MapTileLayerSpec {
  return {
    url: ESRI_CANVAS[mode],
    attribution: TILE_ATTRIBUTION,
    maxZoom: 16,
  };
}
