import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';

import { MqttService } from '../../core/mqtt/mqtt.service';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { FleetMapComponent } from '../../shared/fleet-map/fleet-map';

type Speed = 1 | 2 | 5;

type HistoryPoint = {
  ts?: number;
  lat: number;
  lng: number;
  temp?: number | null;
  battery?: number | null;
  rssi?: number | null;
  snr?: number | null;
};

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FleetMapComponent],
  templateUrl: './map.html',
  styleUrls: ['./map.scss'],
})
export class MapComponent implements OnInit, OnDestroy {
  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;

  deviceEui = '70B3D57ED0074DF2';

  /** Historique brut API */
  historyRaw: any[] = [];

  /** Historique nettoyé + dédoublonné (utilisé pour polyline + replay) */
  history: HistoryPoint[] = [];

  playing = false;
  speed: Speed = 1;

  selected: string | null = this.deviceEui;

  // point courant (replay ou live)
  currentLat: number | null = null;
  currentLng: number | null = null;
  active = true;

  private mqttSub?: Subscription;

  private replayTimer?: number;
  private replayIndex = 0;

  constructor(private api: TelemetryApiService, private mqtt: MqttService) {
    this.status$ = this.mqtt.status$;
  }

  ngOnInit(): void {
    // 1) Charger historique (trajet) depuis Django
    this.api.getHistory(this.deviceEui, 1000).subscribe((res: any) => {
      this.historyRaw = Array.isArray(res?.history) ? res.history : [];
      this.history = this.sanitizeAndDedupeHistory(this.historyRaw);

      // Positionner le marker au 1er point valide (si disponible)
      const first = this.history?.[0];
      if (first) {
        this.currentLat = first.lat;
        this.currentLng = first.lng;
      } else {
        // fallback : si pas d’historique, on garde null et MQTT fera bouger
        this.currentLat = null;
        this.currentLng = null;
      }
    });

    // 2) MQTT live (marker bouge en live)
    this.mqtt.connect();
    this.mqttSub = this.mqtt.telemetry$.subscribe((t) => {
      // si on joue le replay, on ignore le live pour éviter conflits visuels
      if (this.playing) return;

      const lat = Number(t?.lat);
      const lng = Number(t?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      this.currentLat = lat;
      this.currentLng = lng;
      this.active = true;
    });
  }

  ngOnDestroy(): void {
    this.stopReplay();
    this.mqttSub?.unsubscribe();
  }

  /** Indique si on a assez de points pour tracer une trajectoire */
  get hasTrajectory(): boolean {
    return Array.isArray(this.history) && this.history.length >= 2;
  }

  // Devices array pour FleetMap
  get devices(): any[] {
    return [
      {
        device_eui: this.deviceEui,
        active: this.active,
        last: { lat: this.currentLat, lng: this.currentLng },
      },
    ];
  }

  // ---------- Replay controls ----------
  play() {
    if (!this.hasTrajectory) return;

    this.playing = true;

    // si fin -> recommencer
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

    const first = this.history?.[0];
    if (first) {
      this.currentLat = first.lat;
      this.currentLng = first.lng;
    }
  }

  setSpeed(v: Speed) {
    this.speed = v;
    if (this.playing) {
      this.pause();
      this.play();
    }
  }

  private tick() {
    if (!this.playing) return;
    if (!this.hasTrajectory) return;

    const p = this.history[this.replayIndex];
    if (p) {
      this.currentLat = p.lat;
      this.currentLng = p.lng;
    }

    this.replayIndex++;

    if (this.replayIndex >= this.history.length) {
      this.pause();
      return;
    }

    const base = 600; // 0.6s par point en x1
    const wait = Math.max(80, Math.round(base / this.speed));
    this.replayTimer = window.setTimeout(() => this.tick(), wait);
  }

  // ---------- History sanitization ----------
  private sanitizeAndDedupeHistory(raw: any[]): HistoryPoint[] {
    // 1) convert to numbers + filter invalid
    const cleaned: HistoryPoint[] = (raw || [])
      .map((p: any) => {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const ts = p?.ts != null ? Number(p.ts) : undefined;

        return {
          ts: Number.isFinite(ts as number) ? (ts as number) : undefined,
          lat,
          lng,
          temp: this.toNumOrNull(p?.temp),
          battery: this.toNumOrNull(p?.battery),
          rssi: this.toNumOrNull(p?.rssi),
          snr: this.toNumOrNull(p?.snr),
        } as HistoryPoint;
      })
      .filter(Boolean) as HistoryPoint[];

    // 2) dedupe consecutive points (same coords) with a small epsilon
    const eps = 1e-7;
    const deduped: HistoryPoint[] = [];
    for (const pt of cleaned) {
      const prev = deduped[deduped.length - 1];
      if (!prev) {
        deduped.push(pt);
        continue;
      }
      const same =
        Math.abs(prev.lat - pt.lat) < eps &&
        Math.abs(prev.lng - pt.lng) < eps;

      if (!same) deduped.push(pt);
    }

    return deduped;
  }

  private toNumOrNull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
}
