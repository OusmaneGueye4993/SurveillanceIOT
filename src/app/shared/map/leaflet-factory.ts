import * as L from 'leaflet';

export type BaseMapOpts = {
  center?: L.LatLngExpression;
  zoom?: number;
  zoomControl?: boolean;
  attributionControl?: boolean;
};

export function createBaseMap(
  el: string | HTMLElement,
  opts: BaseMapOpts = {}
): L.Map {
  const map = L.map(el as any, {
    center: opts.center ?? [14.69, -17.44],
    zoom: opts.zoom ?? 13,
    zoomControl: opts.zoomControl ?? true,
    attributionControl: opts.attributionControl ?? true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  }).addTo(map);

  return map;
}

export function defaultMarkerIcon(): L.Icon {
  return L.icon({
    iconUrl: 'assets/leaflet/marker-icon.png',
    iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
    shadowUrl: 'assets/leaflet/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}
