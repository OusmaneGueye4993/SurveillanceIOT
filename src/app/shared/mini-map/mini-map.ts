import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'app-mini-map',
  standalone: true,
  templateUrl: './mini-map.html',
  styleUrls: ['./mini-map.scss'],
  // Important: Leaflet génère du DOM hors Angular -> styles à appliquer sans encapsulation
  encapsulation: ViewEncapsulation.None,
})
export class MiniMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() lat: number | null = null;
  @Input() lng: number | null = null;

  // Optionnel: zoom par défaut (tu peux le changer depuis le dashboard si tu veux)
  @Input() zoom = 13;

  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private marker?: L.Marker;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: [14.69, -17.44],
      zoom: this.zoom,
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
   
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      // petit cache / perf, optionnel
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(this.map);

    // ✅ marqueur custom (pas besoin d’assets leaflet)
    this.marker = L.marker([14.69, -17.44], {
      icon: this.makeGreenDotIcon(),
      keyboard: false,
    }).addTo(this.map);

    // Leaflet doit recalculer la taille quand la carte est dans une card/layout
    setTimeout(() => this.map?.invalidateSize(), 0);

    // Position réelle si déjà dispo
    this.updateMarker(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['lat'] || changes['lng'] || changes['zoom']) {
      if (typeof this.zoom === 'number' && Number.isFinite(this.zoom)) {
        this.map.setZoom(this.zoom, { animate: false });
      }
      this.updateMarker(true);
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = undefined;
    this.marker = undefined;
  }

  private updateMarker(center: boolean): void {
    if (!this.map || !this.marker) return;

    const la = Number(this.lat);
    const ln = Number(this.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;

    const pos: L.LatLngExpression = [la, ln];

    // ✅ met à jour + toujours centré
    this.marker.setLatLng(pos);
    if (center) {
      this.map.setView(pos, this.map.getZoom(), { animate: false });
    }
  }

  private makeGreenDotIcon(): L.DivIcon {
    return L.divIcon({
      className: 'saas-marker',
      html: `
        <span class="saas-marker__dot"></span>
        <span class="saas-marker__pulse"></span>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }
}