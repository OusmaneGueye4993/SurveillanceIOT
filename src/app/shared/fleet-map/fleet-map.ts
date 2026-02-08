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

export interface DeviceLast {
  ts?: number;           // ✅ optionnel
  lat?: number | null;   // ✅ optionnel
  lng?: number | null;   // ✅ optionnel
  battery?: number;
  rssi?: number;
  temp?: number;
}

export interface DeviceSummary {
  device_eui: string;
  active: boolean;
  last: DeviceLast;
  lastSeenMs?: number;
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
 // @Input() devices: DeviceSummary[] = [];
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
    this.updateHistoryTrack();
    if (this.follow && this.selected) this.flyToSelected();
  }

  private updateMarkers(): void {
    const nextKeys = new Set(this.devices.map(d => d.device_eui));

    // remove old markers
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

  private updateHistoryTrack(): void {
    this.trackLayer.clearLayers();

    if (!this.showHistory) return;
    if (!this.selected) return;
    if (!this.history || this.history.length < 2) return;

    const pts = this.history
      .map(p => [Number(p.lat), Number(p.lng)] as [number, number])
      .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));

    if (pts.length < 2) return;

    L.polyline(pts, { weight: 4, opacity: 0.85 }).addTo(this.trackLayer);

    const last = pts[pts.length - 1];
    L.marker(last, { icon: this.makeLastPointIcon(), keyboard: false }).addTo(this.trackLayer);
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
        border:2px solid rgba(255,255,255,0.9);
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
        box-shadow:0 0 0 5px rgba(255,152,0,0.22);
      "></div>
    `;
    return L.divIcon({
      className: 'last-point-icon',
      html,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }
}
