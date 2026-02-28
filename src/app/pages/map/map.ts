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
import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { TelemetryStoreService } from '../../core/store/telemetry-store.service';
import { DeviceSummary, TelemetryPoint } from '../../core/models/telemetry.models';

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
  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;

  showHistory = true;
  follow = true;

  windowKey$ = new BehaviorSubject<WindowKey>('1h');

  loadingHistory = false;
  historyError: string | null = null;

  // ✅ Non-null : tableau toujours défini → template doit utiliser history.length (sans ?.)
  history: TelemetryPoint[] = [];

  private sub = new Subscription();

  constructor(
    private api: TelemetryApiService,
    private store: TelemetryStoreService
  ) {
    this.status$ = this.store.status$;
    this.filtered$ = this.store.filtered$;
    this.selected$ = this.store.selected$;
  }

  ngOnInit(): void {
    this.store.startFleetPolling(5000);

    this.sub.add(
      combineLatest([this.selected$, this.windowKey$])
        .pipe(
          distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
          switchMap(([eui, windowKey]) => {
            if (!eui) {
              this.history = [];
              this.loadingHistory = false;
              this.historyError = null;
              return EMPTY;
            }
            return this.loadHistory$(eui, windowKey);
          })
        )
        .subscribe()
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.store.stopFleetPolling();
  }

  onSelect(eui: string) {
    this.store.select(eui);
    this.follow = true;
  }

  setWindow(key: WindowKey) {
    this.windowKey$.next(key);
  }

  refresh() {
    this.store.refreshFleetOnce();
    // force reload history sur la même fenêtre
    this.windowKey$.next(this.windowKey$.value);
  }

  clearHistory() {
    this.history = [];
    this.historyError = null;
    this.loadingHistory = false;
  }

  secondsAgoTs(tsSec: number | null | undefined): string {
    if (!tsSec) return '—';
    const s = Math.max(0, Math.round(Date.now() / 1000 - tsSec));
    return `${s}s`;
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
        tap({
          next: (res) => {
            this.history = res?.history ?? [];
            this.loadingHistory = false;
          },
          error: (err) => {
            console.error(err);
            this.history = [];
            this.loadingHistory = false;
            this.historyError = 'Impossible de charger l’historique';
          },
        })
      );
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