import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subscription,
  combineLatest,
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  tap,
} from 'rxjs/operators';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';

import { MiniMapComponent } from '../../shared/mini-map/mini-map';
import { TelemetryChartComponent } from '../telemetry/telemetry';

import { TelemetryStoreService } from '../../core/store/telemetry-store.service';
import { DeviceStoreService } from '../../core/devices/device-store.service';
import { DashboardSettingsService } from '../../core/settings/dashboard-settings.service';
import { DashboardConfig } from '../../core/settings/dashboard-config.model';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { TelemetryPoint } from '../../core/models/telemetry.models';

export type AlertItem = { level: 'warn' | 'critical'; message: string };

type DeviceSummary = any;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatOptionModule,
    MatDividerModule,
    MatListModule,
    MatTableModule,
    MiniMapComponent,
    TelemetryChartComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private fleet = inject(TelemetryStoreService);
  private settings = inject(DashboardSettingsService);
  private deviceStore = inject(DeviceStoreService);
  private api = inject(TelemetryApiService);

  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;
  devices$!: Observable<DeviceSummary[]>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;

  myDevices$ = this.deviceStore.devices$;
  myDevicesLoading$ = this.deviceStore.loading$;
  myDevicesError$ = this.deviceStore.error$;
  hasAnyDevice$ = this.myDevices$.pipe(map((list) => (list?.length ?? 0) > 0));

  searchCtrl = new FormControl<string>('', { nonNullable: true });

  cfg$!: Observable<DashboardConfig>;
  telemetry$!: Observable<any | null>;
  alerts$!: Observable<AlertItem[]>;

  history: TelemetryPoint[] = [];
  historyLoading = false;
  historyError: string | null = null;

  private historyReload$ = new BehaviorSubject<number>(0);
  private sub = new Subscription();

  ngOnInit(): void {
    this.deviceStore.refresh();

    this.status$ = this.fleet.status$;
    this.devices$ = this.fleet.devices$;
    this.filtered$ = this.fleet.filtered$;
    this.selected$ = this.fleet.selected$;
    this.cfg$ = this.settings.config$;

    this.fleet.startFleetPolling(5000);

    this.sub.add(
      this.searchCtrl.valueChanges
        .pipe(startWith(this.searchCtrl.value), debounceTime(150))
        .subscribe((v) => this.fleet.setSearch(v))
    );

    this.telemetry$ = combineLatest([this.selected$, this.devices$]).pipe(
      map(([eui, devices]) => {
        if (!eui) return null;
        const d = devices.find((x) => x.device_eui === eui);
        if (!d) return null;

        const ts = d.lastTs ?? d.last?.ts ?? null;
        const lat = d.last?.lat ?? d.lat ?? null;
        const lng = d.last?.lng ?? d.lng ?? null;

        if (ts == null || lat == null || lng == null) return null;

        return {
          device_eui: d.device_eui,
          ts,
          lat,
          lng,
          temp: d.temp ?? d.last?.temp ?? null,
          battery: d.battery ?? d.last?.battery ?? null,
          rssi: d.rssi ?? d.last?.rssi ?? null,
          snr: d.snr ?? d.last?.snr ?? null,
        };
      })
    );

    this.sub.add(
      combineLatest([this.selected$, this.historyReload$])
        .pipe(
          distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
          switchMap(([eui]) => {
            if (!eui) {
              this.history = [];
              this.historyLoading = false;
              this.historyError = null;
              return EMPTY;
            }

            const nowSec = Math.floor(Date.now() / 1000);
            const fromSec = nowSec - 3600;

            this.historyLoading = true;
            this.historyError = null;

            return this.api.getHistory(eui, { limit: 120, fromTs: fromSec, toTs: nowSec }).pipe(
              tap((res) => {
                this.history = Array.isArray(res?.history) ? res.history : [];
                this.historyLoading = false;
              }),
              catchError((err) => {
                console.error(err);
                this.history = [];
                this.historyLoading = false;
                this.historyError = 'Impossible de charger l’historique récent.';
                return EMPTY;
              })
            );
          })
        )
        .subscribe()
    );

    this.alerts$ = combineLatest([this.telemetry$, this.cfg$]).pipe(
      map(([t, cfg]) => {
        const out: AlertItem[] = [];
        if (!t) return out;

        const batLow = Number(cfg.alertThresholds.batteryLow);
        const rssiLow = Number(cfg.alertThresholds.rssiLow);
        const tempHigh = Number(cfg.alertThresholds.tempHigh);

        const bat = Number(t.battery);
        if (Number.isFinite(bat) && Number.isFinite(batLow) && bat < batLow) {
          out.push({ level: 'critical', message: `Batterie faible: ${Math.round(bat)}%` });
        }

        const rssi = Number(t.rssi);
        if (Number.isFinite(rssi) && Number.isFinite(rssiLow) && rssi < rssiLow) {
          out.push({ level: 'warn', message: `Signal faible (RSSI): ${Math.round(rssi)} dBm` });
        }

        const temp = Number(t.temp);
        if (Number.isFinite(temp) && Number.isFinite(tempHigh) && temp > tempHigh) {
          out.push({ level: 'warn', message: `Température élevée: ${Math.round(temp)}°C` });
        }

        return out;
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.fleet.stopFleetPolling();
  }

  onSelect(eui: string | null): void {
    if (!eui) return;
    this.fleet.select(eui);
  }

  refresh(): void {
    this.deviceStore.refresh();
    this.fleet.refreshFleetOnce();
    this.historyReload$.next(this.historyReload$.value + 1);
  }

  trackByEui(_: number, d: any) {
    return d?.device_eui ?? _;
  }

  secondsAgo(ms?: number | null): string {
    if (!ms) return '—';
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  }

  fmt(v: any, decimals = 0): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(decimals);
  }
}