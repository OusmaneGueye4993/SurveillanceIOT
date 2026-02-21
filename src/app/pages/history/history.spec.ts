import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  Observable,
  Subscription,
  switchMap,
  tap
} from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';

import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { TelemetryStoreService } from '../../core/store/telemetry-store.service';
import { TelemetryPoint } from '../../core/models/telemetry.models';

type WindowKey = '15m' | '1h' | '6h' | '24h';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatTableModule,
  ],
  templateUrl: './history.html',
  styleUrls: ['./history.scss'], // ✅ correct (pas styleUrl)
})
export class HistoryComponent implements OnInit, OnDestroy {

  // ✅ ne pas initialiser avec this.store ici
  selected$!: Observable<string | null>;

  windowKey$ = new BehaviorSubject<WindowKey>('1h');

  loading = false;
  error: string | null = null;

  history: TelemetryPoint[] = [];

  displayedColumns = ['time', 'temp', 'battery', 'rssi', 'snr', 'latlng'];

  private sub = new Subscription();

  constructor(
    private api: TelemetryApiService,
    private store: TelemetryStoreService
  ) {
    // ✅ initialiser après injection
    this.selected$ = this.store.selected$;
  }

  ngOnInit(): void {
    // optionnel
    this.store.connectMqtt();

    this.sub.add(
      combineLatest([this.selected$, this.windowKey$]).pipe(
        distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
        switchMap(([eui, win]) => {
          if (!eui) {
            this.history = [];
            this.loading = false;
            this.error = null;
            return EMPTY;
          }
          return this.loadHistory$(eui, win);
        })
      ).subscribe()
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setWindow(k: WindowKey) {
    this.windowKey$.next(k);
  }

  refresh() {
    // force reload
    this.windowKey$.next(this.windowKey$.value);
  }

  private loadHistory$(deviceEui: string, windowKey: WindowKey) {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - this.windowSeconds(windowKey);
    const limit = this.suggestLimit(windowKey);

    this.loading = true;
    this.error = null;

    return this.api.getHistory(deviceEui, { limit, fromTs: fromSec, toTs: nowSec }).pipe(
      tap({
        next: (res) => {
          this.history = this.cleanHistory(res?.history ?? []);
          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
          this.error = 'Erreur lors du chargement de l’historique';
          this.history = [];
        }
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
      .map((p) => ({
        ...p,
        ts: Number((p as any).ts),
        lat: Number((p as any).lat),
        lng: Number((p as any).lng),
      }))
      .filter((p) =>
        Number.isFinite(p.ts) &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng)
      );

    // tri ascendant (chrono)
    pts.sort((a, b) => a.ts - b.ts);

    // dedupe positions consécutives
    const eps = 1e-7;
    const out: TelemetryPoint[] = [];
    for (const p of pts) {
      const prev = out[out.length - 1];
      if (prev && Math.abs(prev.lat - p.lat) < eps && Math.abs(prev.lng - p.lng) < eps) {
        continue;
      }
      out.push(p);
    }

    return out;
  }

  fmtTime(ts: number | null | undefined): string {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString();
  }

  fmt(v: any, digits = 0): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(digits);
  }
}
