import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { FleetMapComponent } from '../../shared/fleet-map/fleet-map';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { TelemetryStoreService } from '../../core/store/telemetry-store.service';

type Speed = 1 | 2 | 5;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FleetMapComponent],
  templateUrl: './map.html',
  styleUrls: ['./map.scss'],
})
export class MapComponent implements OnInit, OnDestroy {
  deviceEui: string | null = null;

  history: any[] = [];
  playing = false;
  speed: Speed = 1;

  currentLat: number | null = null;
  currentLng: number | null = null;
  active = true;

  private sub = new Subscription();
  private replayTimer?: number;
  private replayIndex = 0;

  constructor(
    private api: TelemetryApiService,
    private store: TelemetryStoreService
  ) {}

  ngOnInit(): void {
    // assure MQTT connecté (pour live marker)
    this.store.connectMqtt();

    // si pas de selected, prendre le premier device reçu
    this.sub.add(
      this.store.devices$.subscribe((devices) => {
        if (this.deviceEui) return;
        if (devices.length > 0) this.store.select(devices[0].device_eui);
      })
    );

    // quand selected change => reload history
    this.sub.add(
      this.store.selected$.subscribe((eui) => {
        if (!eui) return;
        if (this.deviceEui === eui) return;

        this.deviceEui = eui;
        this.stopReplay();
        this.loadHistory(eui);
        this.syncLivePoint(eui);
      })
    );

    // live update marker (hors replay)
    this.sub.add(
      this.store.devices$.subscribe(() => {
        if (!this.deviceEui) return;
        this.syncLivePoint(this.deviceEui);
      })
    );
  }

  ngOnDestroy(): void {
    this.stopReplay();
    this.sub.unsubscribe();
  }

  get hasTrajectory(): boolean {
    return Array.isArray(this.history) && this.history.length >= 2;
  }

  get devices(): any[] {
    if (!this.deviceEui) return [];
    return [
      {
        device_eui: this.deviceEui,
        active: this.active,
        last: { lat: this.currentLat, lng: this.currentLng },
      },
    ];
  }

  private syncLivePoint(eui: string) {
    const snap = this.store.getDeviceSnapshot(eui);
    if (!snap) return;

    this.active = snap.active;
    if (this.playing) return;

    if (snap.last.lat != null && snap.last.lng != null) {
      this.currentLat = snap.last.lat;
      this.currentLng = snap.last.lng;
    }
  }

  private loadHistory(eui: string) {
    this.api.getHistory(eui, 1500).subscribe((res: any) => {
      const raw = Array.isArray(res?.history) ? res.history : [];

      // clean + dedupe consecutive
      const eps = 1e-7;
      const cleaned: any[] = [];
      for (const p of raw) {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const prev = cleaned[cleaned.length - 1];
        if (prev && Math.abs(prev.lat - lat) < eps && Math.abs(prev.lng - lng) < eps) continue;

        cleaned.push({ ...p, lat, lng });
      }

      this.history = cleaned;

      const first = this.history[0];
      if (first && (this.currentLat == null || this.currentLng == null)) {
        this.currentLat = first.lat;
        this.currentLng = first.lng;
      }
    });
  }

  // Replay
  play() {
    if (!this.hasTrajectory) return;
    this.playing = true;
    if (this.replayIndex >= this.history.length - 1) this.replayIndex = 0;
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

    if (this.deviceEui) this.syncLivePoint(this.deviceEui);

    const first = this.history?.[0];
    if (!this.currentLat && first) this.currentLat = first.lat;
    if (!this.currentLng && first) this.currentLng = first.lng;
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

    const base = 600;
    const wait = Math.max(80, Math.round(base / this.speed));
    this.replayTimer = window.setTimeout(() => this.tick(), wait);
  }
}
