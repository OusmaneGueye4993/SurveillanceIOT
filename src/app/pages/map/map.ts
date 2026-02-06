import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';

import * as L from 'leaflet';

import { MqttService } from '../../core/mqtt/mqtt.service';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;

  deviceEui = '70B3D57ED0074DF2';
  private map!: L.Map;
  private marker!: L.Marker;
  private polyline?: L.Polyline;

  private mqttSub?: Subscription;

  // Replay state
  history: any[] = [];
  private replayTimer?: number;
  private replayIndex = 0;
  playing = false;
  speed: 1 | 2 | 5 = 1;

  constructor(private api: TelemetryApiService, private mqtt: MqttService) {
    this.status$ = this.mqtt.status$;
  }

  async ngAfterViewInit(): Promise<void> {
    // 1) Init map
    this.initMap();

    // 2) Charger historique + tracer + préparer replay
    this.api.getHistory(this.deviceEui, 1000).subscribe((res: any) => {
      this.history = Array.isArray(res?.history) ? res.history : [];
      this.drawHistoryPath(this.history);
      this.fitToHistory(this.history);
      this.setMarkerToFirstPoint(this.history);
    });

    // 3) MQTT live (marker bouge en live)
    this.mqtt.connect();
    this.mqttSub = this.mqtt.telemetry$.subscribe((t) => {
      const lat = Number(t?.lat);
      const lng = Number(t?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      this.marker.setLatLng([lat, lng]);
    });

    setTimeout(() => this.map.invalidateSize(), 200);
  }

  ngOnDestroy(): void {
    this.stopReplay();
    this.mqttSub?.unsubscribe();
    this.map?.remove();
  }

  // ---------- Map init ----------
  private initMap() {
    this.map = L.map('map', { center: [14.69, -17.44], zoom: 13 });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(this.map);

    const icon = L.icon({
      iconUrl: 'assets/leaflet/marker-icon.png',
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    this.marker = L.marker([14.69, -17.44], { icon }).addTo(this.map);
  }

  private drawHistoryPath(points: any[]) {
    if (!this.map) return;

    const latlngs: L.LatLngExpression[] = points
      .map((p) => [Number(p?.lat), Number(p?.lng)] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (latlngs.length < 2) return;

    // Remove old path
    this.polyline?.remove();

    this.polyline = L.polyline(latlngs, {
      // juste un style simple (pas de couleur spécifique obligatoire)
      weight: 4,
      opacity: 0.9,
    }).addTo(this.map);
  }

  private fitToHistory(points: any[]) {
    const latlngs = points
      .map((p) => [Number(p?.lat), Number(p?.lng)] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (latlngs.length < 2) return;

    const bounds = L.latLngBounds(latlngs as any);
    this.map.fitBounds(bounds, { padding: [30, 30] });
  }

  private setMarkerToFirstPoint(points: any[]) {
    const first = points?.[0];
    const lat = Number(first?.lat);
    const lng = Number(first?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    this.marker.setLatLng([lat, lng]);
  }

  // ---------- Replay controls ----------
  play() {
    if (!this.history?.length) return;

    this.playing = true;

    // si on est à la fin, recommencer
    if (this.replayIndex >= this.history.length - 1) {
      this.replayIndex = 0;
    }

    this.tick();
  }

  pause() {
    this.playing = false;
    if (this.replayTimer) window.clearTimeout(this.replayTimer);
    this.replayTimer = undefined;
  }

  stopReplay() {
    this.pause();
    this.replayIndex = 0;
    this.setMarkerToFirstPoint(this.history);
  }

  setSpeed(v: 1 | 2 | 5) {
    this.speed = v;
    if (this.playing) {
      this.pause();
      this.play();
    }
  }

  private tick() {
    if (!this.playing) return;
    if (!this.history?.length) return;

    const p = this.history[this.replayIndex];
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const pos: L.LatLngExpression = [lat, lng];
      this.marker.setLatLng(pos);
      this.map.panTo(pos, { animate: true, duration: 0.4 });
    }

    this.replayIndex++;

    if (this.replayIndex >= this.history.length) {
      this.pause();
      return;
    }

    // interval (ms) : plus speed est grand, plus c'est rapide
    const base = 600; // 0.6s par point en x1
    const wait = Math.max(80, Math.round(base / this.speed));

    this.replayTimer = window.setTimeout(() => this.tick(), wait);
  }
}
