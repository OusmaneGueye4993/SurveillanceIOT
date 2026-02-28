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
  private lastTrackKey = '';

  private resizeObserver?: ResizeObserver;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.initMapOnce();

    // ✅ Important : quand le composant s’affiche après navigation,
    // Leaflet peut calculer une taille 0 -> invalidateSize pour stabiliser
    this.deferInvalidate();

    // ✅ observe resize du conteneur (sidenav, responsive, etc.)
    this.setupResizeObserver();

    this.renderAll();
  }

  ngOnChanges(_: SimpleChanges): void {
    if (!this.initialized) return;
    this.renderAll();
    this.deferInvalidate();
  }

  ngOnDestroy(): void {
    try {
      this.resizeObserver?.disconnect();
    } catch {}
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

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.deferInvalidate());
    this.resizeObserver.observe(this.mapEl.nativeElement);
  }

  private deferInvalidate(): void {
    if (!this.map) return;

    this.zone.runOutsideAngular(() => {
      // double-tick = plus fiable quand Angular rend le layout (sidenav etc.)
      setTimeout(() => this.map.invalidateSize({ pan: false }), 0);
      setTimeout(() => this.map.invalidateSize({ pan: false }), 150);
    });
  }

  private renderAll(): void {
    this.updateMarkers();
    const trackBounds = this.updateHistoryTrack();

    if (this.follow && this.selected) {
      if (trackBounds) this.fitToBounds(trackBounds);
      else this.flyToSelected();
    }
  }

  private updateMarkers(): void {
    const nextKeys = new Set(this.devices.map((d) => String(d?.device_eui || '').toUpperCase()));

    for (const [eui, marker] of this.markers.entries()) {
      if (!nextKeys.has(eui)) {
        marker.remove();
        this.markers.delete(eui);
      }
    }

    for (const raw of this.devices) {
      const eui = String(raw?.device_eui || '').toUpperCase();
      if (!eui) continue;

      const lat = Number(raw?.last?.lat);
      const lng = Number(raw?.last?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const latlng: L.LatLngExpression = [lat, lng];
      const isSel = eui === (this.selected || '').toUpperCase();
      const active = !!raw?.active;

      if (!this.markers.has(eui)) {
        const m = L.marker(latlng, {
          icon: this.makeDotIcon(active ? 'active' : 'inactive', isSel),
          keyboard: false,
        });

        m.on('click', () => this.zone.run(() => this.selectDevice.emit(eui)));
        m.addTo(this.markerLayer);
        this.markers.set(eui, m);
      } else {
        const m = this.markers.get(eui)!;
        m.setLatLng(latlng);
        m.setIcon(this.makeDotIcon(active ? 'active' : 'inactive', isSel));
      }
    }
  }

  private updateHistoryTrack(): L.LatLngBounds | null {
    this.trackLayer.clearLayers();

    if (!this.showHistory) return null;
    if (!this.selected) return null;
    if (!this.history || this.history.length < 2) return null;

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

    const first = pts[0];
    const last = pts[pts.length - 1];
    const trackKey = `${this.selected}|${pts.length}|${first[0].toFixed(6)},${first[1].toFixed(6)}|${last[0].toFixed(6)},${last[1].toFixed(6)}`;

    const line = L.polyline(pts, {
      className: 'track-line',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1.2,
    });

    line.addTo(this.trackLayer);

    L.marker(pts[0], { icon: this.makeEndpointIcon('start'), keyboard: false })
      .addTo(this.trackLayer)
      .bindTooltip('Départ', { direction: 'top', offset: [0, -10], opacity: 0.9 });

    L.marker(last, { icon: this.makeEndpointIcon('end'), keyboard: false })
      .addTo(this.trackLayer)
      .bindTooltip('Dernier point', { direction: 'top', offset: [0, -10], opacity: 0.9 });

    L.marker(last, { icon: this.makeLastPointIcon(), keyboard: false }).addTo(this.trackLayer);

    const bounds = line.getBounds();

    if (trackKey !== this.lastTrackKey) this.lastTrackKey = trackKey;

    return bounds.isValid() ? bounds : null;
  }

  private fitToBounds(bounds: L.LatLngBounds): void {
    this.map.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 16,
      animate: true,
      duration: 0.6,
    });
  }

  private flyToSelected(): void {
    const key = (this.selected || '').toUpperCase();
    const m = this.markers.get(key);
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

    // ✅ FIX : HTML correctement fermé (sinon markers invisibles aléatoirement)
    const html = `
      <div class="endpoint-badge" style="
        width:22px;height:22px;border-radius:50%;
        background:${bg};
        border:3px solid rgba(255,255,255,0.95);
        box-shadow:0 6px 14px rgba(0,0,0,0.22);
        display:flex;align-items:center;justify-content:center;
        color:#fff;
        font:700 12px/18px system-ui, -apple-system, Segoe UI, Roboto, Arial;
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