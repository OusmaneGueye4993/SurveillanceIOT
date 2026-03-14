import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subscription,
  combineLatest,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';

import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { TelemetryStoreService } from '../../core/store/telemetry-store.service';
import { TelemetryPoint } from '../../core/models/telemetry.models';
import { DeviceStoreService } from '../../core/devices/device-store.service';

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
  styleUrls: ['./history.scss'],
})
export class HistoryComponent implements OnInit, OnDestroy {
  selected$!: Observable<string | null>;
  hasAnyDevice$!: Observable<boolean>;

  windowKey$ = new BehaviorSubject<WindowKey>('1h');
  reload$ = new BehaviorSubject<number>(0);

  loading = false;
  error: string | null = null;
  history: TelemetryPoint[] = [];

  displayedColumns = ['time', 'temp', 'battery', 'rssi', 'snr', 'latlng'];

  private sub = new Subscription();

  constructor(
    private api: TelemetryApiService,
    private store: TelemetryStoreService,
    private deviceStore: DeviceStoreService
  ) {}

  ngOnInit(): void {
    this.selected$ = this.store.selected$;
    this.hasAnyDevice$ = this.deviceStore.devices$.pipe(
      map((list) => (list?.length ?? 0) > 0)
    );

    this.deviceStore.refresh();
    this.store.startFleetPolling(5000);

    this.sub.add(
      combineLatest([this.selected$, this.windowKey$, this.reload$])
        .pipe(
          distinctUntilChanged(
            (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
          ),
          switchMap(([eui, win]) => {
            if (!eui) {
              this.history = [];
              this.loading = false;
              this.error = null;
              return EMPTY;
            }

            return this.loadHistory$(eui, win);
          })
        )
        .subscribe()
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.store.stopFleetPolling();
  }

  setWindow(k: WindowKey): void {
    this.windowKey$.next(k);
  }

  refresh(): void {
    this.deviceStore.refresh();
    this.store.refreshFleetOnce();
    this.reload$.next(this.reload$.value + 1);
  }

  private loadHistory$(deviceEui: string, windowKey: WindowKey) {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - this.windowSeconds(windowKey);
    const limit = this.suggestLimit(windowKey);

    this.loading = true;
    this.error = null;

    return this.api
      .getHistory(deviceEui, { limit, fromTs: fromSec, toTs: nowSec })
      .pipe(
        tap((res) => {
          this.history = this.cleanHistory(res?.history ?? []);
          this.loading = false;
        }),
        catchError((err) => {
          console.error(err);
          this.loading = false;
          this.error = 'Impossible de charger l’historique pour cet appareil.';
          this.history = [];
          return EMPTY;
        })
      );
  }

  private windowSeconds(k: WindowKey): number {
    switch (k) {
      case '15m':
        return 15 * 60;
      case '1h':
        return 60 * 60;
      case '6h':
        return 6 * 60 * 60;
      case '24h':
        return 24 * 60 * 60;
      default:
        return 60 * 60;
    }
  }

  private suggestLimit(k: WindowKey): number {
    switch (k) {
      case '15m':
        return 300;
      case '1h':
        return 800;
      case '6h':
        return 2000;
      case '24h':
        return 5000;
      default:
        return 800;
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
      .filter(
        (p) =>
          Number.isFinite(p.ts) &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng)
      );

    pts.sort((a, b) => a.ts - b.ts);
    return pts;
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