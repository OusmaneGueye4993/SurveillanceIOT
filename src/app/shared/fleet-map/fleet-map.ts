import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

@Component({
  selector: 'app-fleet-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fleet-map.html',
  styleUrls: ['./fleet-map.scss'],
})
export class FleetMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() devices: any[] = [];
  @Input() selected: string | null = null;

  /** Historique (optionnel) : [{lat,lng,ts?}, ...] */
  @Input() history: any[] | null = null;

  /** Si true : la carte suit automatiquement le marker sélectionné (ou le 1er device) */
  @Input() follow = false;

  /** Centre/zoom par défaut */
  @Input() center: [number, number] = [14.6940, -17.4445];
  @Input() zoom = 13;

  @Output() selectDevice = new EventEmitter<string>();

  @ViewChild('fleetMap', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private markers = new Map<string, L.Marker>();
  private path?: L.Polyline;

  private resizeObserver?: ResizeObserver;
  private didInitialFit = false;

  ngAfterViewInit(): void {
    this.initMap();
    this.refreshAll(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;

    const devicesChanged = !!changes['devices'];
    const selectedChanged = !!changes['selected'];
    const historyChanged = !!changes['history'];

    if (devicesChanged || selectedChanged) this.renderMarkers();
    if (historyChanged) this.renderHistory();

    if (this.follow && (devicesChanged || selectedChanged || historyChanged)) {
      this.followTarget();
    }

    // important si la carte est dans mat-card / onglet / layout flex
    this.safeInvalidateSize();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    this.map?.remove();
    this.map = undefined;

    this.markers.clear();
    this.path = undefined;
  }

  // ---------- Init ----------
  private initMap(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: this.center,
      zoom: this.zoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(this.map);

    // ResizeObserver pour corriger les maps invisibles après layout
    this.resizeObserver = new ResizeObserver(() => this.safeInvalidateSize());
    this.resizeObserver.observe(this.mapEl.nativeElement);

    // 1er invalidate size léger
    setTimeout(() => this.safeInvalidateSize(), 150);
  }

  private safeInvalidateSize(): void {
    if (!this.map) return;
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private refreshAll(first = false): void {
    this.renderHistory();
    this.renderMarkers();

    if (this.follow) this.followTarget();
    if (first) this.safeInvalidateSize();
  }

  // ---------- Markers ----------
  private renderMarkers(): void {
    if (!this.map) return;

    // Clear markers
    this.markers.forEach((m) => m.remove());
    this.markers.clear();

    for (const d of this.devices || []) {
      const eui = d?.device_eui ?? d?.id ?? d?.name ?? '';
      if (!eui) continue;

      const lat = d?.last?.lat ?? d?.lat;
      const lng = d?.last?.lng ?? d?.lng;

      if (lat == null || lng == null) continue;

      const active = !!d?.active;

      const marker = L.marker([Number(lat), Number(lng)], {
        icon: this.getDeviceIcon(active, eui === this.selected),
      });

      marker.on('click', () => this.selectDevice.emit(String(eui)));

      marker.bindTooltip(
        `${eui} • ${active ? 'Actif' : 'Inactif'}`,
        { direction: 'top', offset: [0, -8] }
      );

      marker.addTo(this.map);
      this.markers.set(String(eui), marker);
    }
  }

  private getDeviceIcon(active: boolean, selected: boolean): L.DivIcon {
    let cls = 'marker';
    cls += active ? ' marker-ok' : ' marker-off';
    if (selected) cls += ' marker-selected';

    return L.divIcon({
      className: cls,
      iconSize: selected ? [20, 20] : [16, 16],
      iconAnchor: selected ? [10, 10] : [8, 8],
    });
  }

  // ---------- History path ----------
  private renderHistory(): void {
    if (!this.map) return;

    // Remove old
    this.path?.remove();
    this.path = undefined;

    const points = Array.isArray(this.history) ? this.history : [];
    const latlngs: L.LatLngExpression[] = points
      .map((p) => [Number(p?.lat), Number(p?.lng)] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (latlngs.length < 2) return;

    this.path = L.polyline(latlngs, {
      weight: 4,
      opacity: 0.9,
    }).addTo(this.map);

    // Fit une seule fois au début (si follow)
    if (this.follow && !this.didInitialFit) {
      this.didInitialFit = true;
      const bounds = L.latLngBounds(latlngs as any);
      this.map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  // ---------- Follow ----------
  private followTarget(): void {
    if (!this.map) return;

    // 1) si selected existe
    if (this.selected && this.markers.has(this.selected)) {
      const m = this.markers.get(this.selected)!;
      this.map.setView(m.getLatLng(), Math.max(this.map.getZoom(), this.zoom), {
        animate: true,
      });
      return;
    }

    // 2) sinon 1er marker
    const first = this.markers.values().next().value as L.Marker | undefined;
    if (first) {
      this.map.setView(first.getLatLng(), Math.max(this.map.getZoom(), this.zoom), {
        animate: true,
      });
    }
  }
}
