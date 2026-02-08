import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  Observable,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';

import { FleetMapComponent } from '../../shared/fleet-map/fleet-map';
import { TelemetryApiService, TelemetryPoint } from '../../core/api/telemetry-api.service';
import { TelemetryStoreService, DeviceSummary } from '../../core/store/telemetry-store.service';

type WindowKey = '15m' | '1h' | '6h' | '24h';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatButtonModule,
    FleetMapComponent,
  ],
  templateUrl: './map.html',
  styleUrls: ['./map.scss'],
})
export class MapComponent implements OnInit, OnDestroy {
  // ✅ IMPORTANT: ne pas initialiser avec this.store ici
  status$!: Observable<any>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;

  showHistory = true;
  follow = true;

  // ✅ Fenêtre de temps
  windowKey$ = new BehaviorSubject<WindowKey>('1h');

  // UI display
  loadingHistory = false;
  historyError: string | null = null;

  // Pour la carte
  history: TelemetryPoint[] = [];

  private sub = new Subscription();

  constructor(
    private api: TelemetryApiService,
    private store: TelemetryStoreService
  ) {
    // ✅ INITIALISATION ICI (store déjà disponible)
    this.status$ = this.store.status$;
    this.filtered$ = this.store.filtered$;
    this.selected$ = this.store.selected$;
  }

  ngOnInit(): void {
    this.store.connectMqtt();

    // ✅ Charger l'historique automatiquement quand:
    // - device sélectionné change
    // - fenêtre de temps change
    this.sub.add(
      combineLatest([this.selected$, this.windowKey$]).pipe(
        distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
        switchMap(([eui, windowKey]) => {
          if (!eui) {
            this.history = [];
            this.loadingHistory = false;
            this.historyError = null;
            return EMPTY; // ✅ pas [] (sinon erreur de type)
          }
          return this.loadHistory$(eui, windowKey);
        })
      ).subscribe()
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onSelect(eui: string) {
    this.store.select(eui);
  }

  setWindow(key: WindowKey) {
    this.windowKey$.next(key);
  }

  refresh() {
    // force reload : on ré-émet la même windowKey pour déclencher combineLatest
    this.windowKey$.next(this.windowKey$.value);
  }

  private loadHistory$(deviceEui: string, windowKey: WindowKey) {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - this.windowSeconds(windowKey);

    // ✅ limit “pro” : plus la fenêtre est grande, plus on augmente
    const limit = this.suggestLimit(windowKey);

    this.loadingHistory = true;
    this.historyError = null;

    return this.api.getHistory(deviceEui, { limit, fromTs: fromSec, toTs: nowSec }).pipe(
      tap({
        next: (res) => {
          const cleaned = this.cleanHistory(res?.history ?? []);

          this.history = cleaned;
          this.loadingHistory = false;
        },
        error: (err) => {
          this.loadingHistory = false;
          this.historyError = 'Erreur lors du chargement de l’historique';
          this.history = [];
          console.error(err);
        },
      })
    );
  }

  private windowSeconds(k: WindowKey): number {
    switch (k) {
      case '15m': return 15 * 60;
      case '1h':  return 60 * 60;
      case '6h':  return 6 * 60 * 60;
      case '24h': return 24 * 60 * 60;
    }
  }

  private suggestLimit(k: WindowKey): number {
    switch (k) {
      case '15m': return 300;
      case '1h':  return 800;
      case '6h':  return 2000;
      case '24h': return 5000;
    }
  }


  private cleanHistory(list: TelemetryPoint[]): TelemetryPoint[] {
  const pts = (list ?? [])
    .map(p => ({
      ...p,
      ts: Number((p as any).ts),
      lat: Number((p as any).lat),
      lng: Number((p as any).lng),
    }))
    .filter(p =>
      Number.isFinite(p.ts) &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
    );

  pts.sort((a, b) => a.ts - b.ts);

  // dedupe lat/lng consécutifs
  const eps = 1e-7;
  const out: TelemetryPoint[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.lat - p.lat) < eps && Math.abs(prev.lng - p.lng) < eps) continue;
    out.push(p);
  }
  return out;
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


