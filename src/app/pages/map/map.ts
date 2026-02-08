import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { FleetMapComponent } from '../../shared/fleet-map/fleet-map';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { TelemetryStoreService, DeviceSummary } from '../../core/store/telemetry-store.service';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatDividerModule,
    MatSlideToggleModule,
    FleetMapComponent,
  ],
  templateUrl: './map.html',
  styleUrls: ['./map.scss'],
})
export class MapComponent implements OnInit, OnDestroy {
  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;

  showHistory = true;
  history: any[] = [];

  private sub = new Subscription();

  constructor(
    private api: TelemetryApiService,
    private store: TelemetryStoreService
  ) {}

  ngOnInit(): void {
    // ✅ expose les observables utilisés dans map.html
    this.status$ = this.store.status$;
    this.filtered$ = this.store.filtered$;
    this.selected$ = this.store.selected$;

    this.store.connectMqtt();

    // ✅ quand selected change => charger historique
    this.sub.add(
      this.selected$.subscribe((eui) => {
        if (!eui) {
          this.history = [];
          return;
        }
        this.loadHistory(eui);
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onSelect(eui: string) {
    this.store.select(eui);
  }

  private loadHistory(eui: string) {
    this.api.getHistory(eui, 1500).subscribe((res: any) => {
      const raw = Array.isArray(res?.history) ? res.history : [];

      // clean + dedupe
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
    });
  }

  trackByEui(_: number, d: DeviceSummary) {
    return d.device_eui;
  }

  secondsAgo(ms: number): string {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    return `${s}s`;
  }

  fmt(v: any, digits = 0): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(digits);
  }
}
