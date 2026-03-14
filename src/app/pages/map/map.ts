import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subject,
  combineLatest,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  map,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';

import { FleetMapComponent } from '../../shared/fleet-map/fleet-map';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { TelemetryStoreService } from '../../core/store/telemetry-store.service';
import {
  DeviceSummary,
  TelemetryPoint,
} from '../../core/models/telemetry.models';
import { DeviceStoreService } from '../../core/devices/device-store.service';

type WindowKey = '15m' | '1h' | '6h' | '24h';
type ConnStatus = 'disconnected' | 'connecting' | 'connected';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatButtonModule,
    FleetMapComponent,
  ],
  templateUrl: './map.html',
  styleUrls: ['./map.scss'],
})
export class MapComponent implements OnInit, OnDestroy {
  status$!: Observable<ConnStatus>;
  devices$!: Observable<DeviceSummary[]>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;
  hasAnyDevice$!: Observable<boolean>;

  showHistory = true;
  follow = true;

  windowKey$ = new BehaviorSubject<WindowKey>('1h');
  reload$ = new BehaviorSubject<number>(0);

  loadingHistory = false;
  historyError: string | null = null;
  history: TelemetryPoint[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private api: TelemetryApiService,
    private store: TelemetryStoreService,
    private deviceStore: DeviceStoreService
  ) {}

  ngOnInit(): void {
    this.status$ = this.store.status$;
    this.devices$ = this.store.devices$;
    this.filtered$ = this.store.filtered$;
    this.selected$ = this.store.selected$;
    this.hasAnyDevice$ = this.deviceStore.devices$.pipe(
      map((list) => (list?.length ?? 0) > 0)
    );

    this.deviceStore.refresh();
    this.store.startFleetPolling(5000);

    combineLatest([this.selected$, this.windowKey$, this.reload$])
      .pipe(
        distinctUntilChanged(
          (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
        ),
        switchMap(([eui, windowKey]) => {
          if (!eui) {
            this.resetHistoryUI();
            return EMPTY;
          }
          return this.loadHistory$(eui, windowKey);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.store.stopFleetPolling();
  }

  onSelect(eui: string): void {
    const normalized = String(eui || '').trim().toUpperCase();
    if (!normalized) return;
    this.store.select(normalized);
    this.follow = true;
  }

  setWindow(key: WindowKey): void {
    this.windowKey$.next(key);
  }

  refresh(): void {
    this.deviceStore.refresh();
    this.store.refreshFleetOnce();
    this.reload$.next(this.reload$.value + 1);
  }

  clearHistory(): void {
    this.history = [];
    this.historyError = null;
    this.loadingHistory = false;
  }

  secondsAgoTs(tsSec: number | null | undefined): string {
    if (!tsSec) return '—';
    const s = Math.max(0, Math.round(Date.now() / 1000 - tsSec));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  }

  private resetHistoryUI(): void {
    this.history = [];
    this.loadingHistory = false;
    this.historyError = null;
  }

  private loadHistory$(deviceEui: string, windowKey: WindowKey) {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - this.windowSeconds(windowKey);
    const limit = this.suggestLimit(windowKey);

    this.loadingHistory = true;
    this.historyError = null;

    return this.api
      .getHistory(deviceEui, { fromTs: fromSec, toTs: nowSec, limit })
      .pipe(
        tap((res) => {
          this.history = this.cleanHistory(res?.history ?? []);
          this.loadingHistory = false;
        }),
        catchError((err) => {
          console.error(err);
          this.resetHistoryUI();
          this.historyError = 'Impossible de charger le trajet historique.';
          return EMPTY;
        })
      );
  }

  private cleanHistory(list: TelemetryPoint[]): TelemetryPoint[] {
    return (list ?? [])
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
      )
      .sort((a, b) => a.ts - b.ts);
  }

  private windowSeconds(key: WindowKey): number {
    switch (key) {
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

  private suggestLimit(key: WindowKey): number {
    switch (key) {
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
}