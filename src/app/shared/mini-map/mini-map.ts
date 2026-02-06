import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'app-mini-map',
  standalone: true,
  templateUrl: 'mini-map.html',
  styleUrl: 'mini-map.scss',
})
export class MiniMapComponent implements AfterViewInit, OnDestroy {
  @Input() lat: number | null = null;
  @Input() lng: number | null = null;

  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private marker?: L.Marker;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: [14.69, -17.44],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);

    const icon = L.icon({
      iconUrl: 'assets/leaflet/marker-icon.png',
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      shadowSize: [41, 41],
    });

    this.marker = L.marker([14.69, -17.44], { icon }).addTo(this.map);

    setTimeout(() => this.map?.invalidateSize(), 0);
    this.updateMarker();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  ngOnChanges(): void {
    this.updateMarker();
  }

  private updateMarker() {
    if (!this.map || !this.marker) return;
    if (!Number.isFinite(this.lat as any) || !Number.isFinite(this.lng as any)) return;
    const pos: L.LatLngExpression = [this.lat!, this.lng!];
    this.marker.setLatLng(pos);
    this.map.setView(pos, this.map.getZoom(), { animate: false });
  }
}
