import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';

import { MqttService } from '../../core/mqtt/mqtt.service';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { FleetMapComponent } from '../../shared/fleet-map/fleet-map';

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

  // replay + affichage
  history: any[] = [];
  playing = false;
  speed: 1 | 2 | 5 = 1;

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
    // 1) Charger historique (trajet)
    this.api.getHistory(this.deviceEui, 1000).subscribe((res: any) => {
      this.history = Array.isArray(res?.history) ? res.history : [];
      // mettre le marker au premier point
      const first = this.history?.[0];
      const lat = Number(first?.lat);
      const lng = Number(first?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        this.currentLat = lat;
        this.currentLng = lng;
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
    if (!this.history?.length) return;

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
    const lat = Number(first?.lat);
    const lng = Number(first?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.currentLat = lat;
      this.currentLng = lng;
    }
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
      this.currentLat = lat;
      this.currentLng = lng;
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
}
