import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

export interface HistoryPoint {
  ts?: number;
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-fleet-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fleet-map.html',
  styleUrls: ['./fleet-map.scss'],
})
export class FleetMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  @Input() devices: any[] = [];
  @Input() selected: string | null = null;

  @Input() history: HistoryPoint[] | null = null;
  @Input() follow = false;
  @Input() showHistory = true;

  @Input() initialCenter: [number, number] = [14.694, -17.4445];
  @Input() initialZoom = 12;

  @Output() selectDevice = new EventEmitter<string>();

  private map!: L.Map;
  private tiles!: L.TileLayer;

  private markerLayer = L.layerGroup();
  private trackLayer = L.layerGroup();
  private markers = new Map<string, L.Marker>();

  private initialized = false;

  // pour éviter de refaire fitBounds en boucle inutilement
  private lastTrackKey = '';

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.initMapOnce();
    this.renderAll();
  }

  ngOnChanges(_: SimpleChanges): void {
    if (!this.initialized) return;
    this.renderAll();
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
  }

  private initMapOnce(): void {
    if (this.initialized) return;

    this.zone.runOutsideAngular(() => {
      this.map = L.map(this.mapEl.nativeElement, {
        center: this.initialCenter,
        zoom: this.initialZoom,
        zoomControl: true,
      });

      this.tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '© OpenStreetMap contributors',
      });

      this.tiles.addTo(this.map);
      this.markerLayer.addTo(this.map);
      this.trackLayer.addTo(this.map);

      this.initialized = true;
    });
  }

  private renderAll(): void {
    this.updateMarkers();
    const trackBounds = this.updateHistoryTrack();

    // ✅ follow pro:
    // - si trajectoire: fitBounds sur le trajet
    // - sinon: flyToSelected sur le marker
    if (this.follow && this.selected) {
      if (trackBounds) this.fitToBounds(trackBounds);
      else this.flyToSelected();
    }
  }

  private updateMarkers(): void {
    const nextKeys = new Set(this.devices.map((d) => d.device_eui));

    // remove old
    for (const [eui, marker] of this.markers.entries()) {
      if (!nextKeys.has(eui)) {
        marker.remove();
        this.markers.delete(eui);
      }
    }

    // add/update
    for (const d of this.devices) {
      const lat = Number(d?.last?.lat);
      const lng = Number(d?.last?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const latlng: L.LatLngExpression = [lat, lng];
      const isSel = d.device_eui === this.selected;

      if (!this.markers.has(d.device_eui)) {
        const m = L.marker(latlng, {
          icon: this.makeDotIcon(d.active ? 'active' : 'inactive', isSel),
          keyboard: false,
        });

        m.on('click', () => this.zone.run(() => this.selectDevice.emit(d.device_eui)));
        m.addTo(this.markerLayer);
        this.markers.set(d.device_eui, m);
      } else {
        const m = this.markers.get(d.device_eui)!;
        m.setLatLng(latlng);
        m.setIcon(this.makeDotIcon(d.active ? 'active' : 'inactive', isSel));
      }
    }
  }

  /**
   * Dessine une trajectoire "pro" :
   * - polyline arrondie + smoothFactor
   * - START (S) + END (E)
   * - marker last point (halo)
   *
   * Retourne bounds si trajectoire valide (pour fitBounds)
   */
  private updateHistoryTrack(): L.LatLngBounds | null {
    this.trackLayer.clearLayers();

    if (!this.showHistory) return null;
    if (!this.selected) return null;
    if (!this.history || this.history.length < 2) return null;

    // Nettoyage + dé-duplication simple (évite points identiques consécutifs)
    const pts: [number, number][] = [];
    let prev: [number, number] | null = null;

    for (const p of this.history) {
      const la = Number(p?.lat);
      const ln = Number(p?.lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;

      const cur: [number, number] = [la, ln];
      if (!prev || Math.abs(prev[0] - cur[0]) > 1e-9 || Math.abs(prev[1] - cur[1]) > 1e-9) {
        pts.push(cur);
        prev = cur;
      }
    }

    if (pts.length < 2) return null;

    // Key (pour éviter fitBounds trop fréquent si rien ne change)
    const first = pts[0];
    const last = pts[pts.length - 1];
    const trackKey = `${this.selected}|${pts.length}|${first[0].toFixed(6)},${first[1].toFixed(
      6
    )}|${last[0].toFixed(6)},${last[1].toFixed(6)}`;

    // Polyline pro
    const line = L.polyline(pts, {
      className: 'track-line',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1.2,
    });
    line.addTo(this.trackLayer);

    // Start / End markers
    L.marker(pts[0], { icon: this.makeEndpointIcon('start'), keyboard: false })
      .addTo(this.trackLayer)
      .bindTooltip('Départ', { direction: 'top', offset: [0, -10], opacity: 0.9 });

    L.marker(last, { icon: this.makeEndpointIcon('end'), keyboard: false })
      .addTo(this.trackLayer)
      .bindTooltip('Dernier point', { direction: 'top', offset: [0, -10], opacity: 0.9 });

    // halo "last point" (plus visible)
    L.marker(last, { icon: this.makeLastPointIcon(), keyboard: false }).addTo(this.trackLayer);

    const bounds = line.getBounds();

    // mémorise pour follow/fitBounds plus stable
    if (trackKey !== this.lastTrackKey) this.lastTrackKey = trackKey;

    return bounds.isValid() ? bounds : null;
  }

  private fitToBounds(bounds: L.LatLngBounds): void {
    // padding pour UI + éviter trop de zoom
    this.map.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 16,
      animate: true,
      duration: 0.6,
    });
  }

  private flyToSelected(): void {
    const m = this.markers.get(this.selected!);
    if (!m) return;
    const ll = m.getLatLng();
    this.map.flyTo(ll, Math.max(this.map.getZoom(), 14), { duration: 0.8 });
  }

  private makeDotIcon(state: 'active' | 'inactive', selected: boolean): L.DivIcon {
    const color = state === 'active' ? '#2e7d32' : '#c62828';
    const ring = selected ? '0 0 0 4px rgba(33,150,243,0.35)' : 'none';
    const size = selected ? 14 : 12;

    const html = `
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};
        box-shadow:${ring};
        border:2px solid rgba(255,255,255,0.95);
      "></div>
    `;

    return L.divIcon({
      className: 'dot-icon',
      html,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  private makeLastPointIcon(): L.DivIcon {
    const html = `
      <div style="
        width:18px;height:18px;border-radius:50%;
        background:#ff9800;
        border:3px solid rgba(255,255,255,0.95);
        box-shadow:0 0 0 6px rgba(255,152,0,0.18);
      "></div>
    `;
    return L.divIcon({
      className: 'last-point-icon',
      html,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  private makeEndpointIcon(kind: 'start' | 'end'): L.DivIcon {
    const bg = kind === 'start' ? '#2e7d32' : '#1976d2';
    const label = kind === 'start' ? 'S' : 'E';

    const html = `
      <div class="endpoint-badge" style="
        width:22px;height:22px;border-radius:50%;
        background:${bg};
        border:3px solid rgba(255,255,255,0.95);
        box-shadow:0 6px 14px rgba(0,0,0,0.22);
        display:flex;align-items:center;justify-content:center;
        color:#fff;
      ">${label}</div>
    `;

    return L.divIcon({
      className: 'endpoint-icon',
      html,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }
}