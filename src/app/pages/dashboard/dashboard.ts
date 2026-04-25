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

import { MiniMapComponent } from '../../shared/mini-map/mini-map';
import { TelemetryChartComponent } from '../telemetry/telemetry';

import { TelemetryStoreService } from '../../core/store/telemetry-store.service';
import { DeviceStoreService } from '../../core/devices/device-store.service';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';
import { DeviceSummary, TelemetryPoint } from '../../core/models/telemetry.models';

import { DashboardSettingsService } from '../settings/dashboard-settings.service';
import { DashboardConfig } from '../settings/dashboard-config.model';

type ConnStatus = 'disconnected' | 'connecting' | 'connected';

type TelemetryView = {
  device_eui: string;
  ts: number | null
  lat: number | null;
  lng: number | null;
  temp: number | null;
  battery: number | null;
  rssi: number | null;
  snr: number | null;
};

type PreviewAlert = {
  level: 'info' | 'warn' | 'critical';
  title: string;
  message: string;
};

type DashboardVm = {
  device: DeviceSummary | null;
  telemetry: TelemetryView | null;
  alertCount: number;
  freshnessSec: number | null;
  isOnline: boolean;
  hasGps: boolean;
  apiStatus: ConnStatus;
  totalVisibleDevices: number;
  cfg: DashboardConfig;
};

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

  status$!: Observable<ConnStatus>;
  devices$!: Observable<DeviceSummary[]>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;

  myDevices$ = this.deviceStore.devices$;
  hasAnyDevice$ = this.myDevices$.pipe(map((list) => (list?.length ?? 0) > 0));

  searchCtrl = new FormControl<string>('', { nonNullable: true });

  selectedDevice$!: Observable<DeviceSummary | null>;
  telemetry$!: Observable<TelemetryView | null>;
  alerts$!: Observable<PreviewAlert[]>;
  vm$!: Observable<DashboardVm>;

  history: TelemetryPoint[] = [];
  historyLoading = false;
  historyError: string | null = null;

  private historyReload$ = new BehaviorSubject<number>(0);
  private sub = new Subscription();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.deviceStore.refresh();

    this.status$ = this.fleet.status$;
    this.devices$ = this.fleet.devices$;
    this.filtered$ = this.fleet.filtered$;
    this.selected$ = this.fleet.selected$;

    this.sub.add(
      this.searchCtrl.valueChanges
        .pipe(startWith(this.searchCtrl.value), debounceTime(160))
        .subscribe((value) => this.fleet.setSearch(value))
    );

    this.sub.add(
      this.settingsSubject().subscribe((cfg) => {
        this.restartPolling(cfg);
      })
    );

    this.selectedDevice$ = combineLatest([this.selected$, this.devices$]).pipe(
      map(([selected, devices]) => {
        if (!selected) return null;
        return devices.find((d) => d.device_eui === selected) ?? null;
      })
    );

    this.telemetry$ = this.selectedDevice$.pipe(
      map((d) => {
        if (!d) return null;

        return {
          device_eui: d.device_eui,
          ts: d.lastTs ?? d.last?.ts ?? null,
          lat: d.last?.lat ?? d.lat ?? null,
          lng: d.last?.lng ?? d.lng ?? null,
          temp: d.temp ?? d.last?.temp ?? null,
          battery: d.battery ?? d.last?.battery ?? null,
          rssi: d.rssi ?? d.last?.rssi ?? null,
          snr: d.snr ?? d.last?.snr ?? null,
        };
      })
    );

    this.sub.add(
      combineLatest([this.selected$, this.historyReload$, this.settingsSubject()])
        .pipe(
          distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
          switchMap(([eui, _, cfg]) => {
            if (!eui || !cfg.widgets.history) {
              this.history = [];
              this.historyLoading = false;
              this.historyError = null;
              return EMPTY;
            }

            const nowSec = Math.floor(Date.now() / 1000);
            const fromSec = nowSec - 3600;

            this.historyLoading = true;
            this.historyError = null;

            return this.api
              .getHistory(eui, { limit: 120, fromTs: fromSec, toTs: nowSec })
              .pipe(
                tap((res) => {
                  this.history = Array.isArray(res?.history) ? res.history : [];
                  this.historyLoading = false;
                }),
                catchError(() => {
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

    this.alerts$ = combineLatest([this.telemetry$, this.settingsSubject()]).pipe(
      map(([t, cfg]) => {
        const items: PreviewAlert[] = [];

        if (!t) {
          items.push({
            level: 'warn',
            title: 'Aucune télémétrie',
            message: 'Aucune donnée temps réel exploitable pour l’appareil sélectionné.',
          });
          return items;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const staleSeconds = Number(cfg.alertThresholds.staleSeconds);

        const freshnessSec =
          t.ts != null && Number.isFinite(Number(t.ts))
            ? Math.max(0, nowSec - Number(t.ts))
            : null;

        if (freshnessSec == null) {
          items.push({
            level: 'warn',
            title: 'Dernière mise à jour inconnue',
            message: 'Le système ne connaît pas encore l’horodatage du dernier point reçu.',
          });
        } else if (freshnessSec > staleSeconds) {
          items.push({
            level: 'critical',
            title: 'Device silencieux',
            message: `Aucune mise à jour récente depuis ${freshnessSec} secondes.`,
          });
        }

        const battery = Number(t.battery);
        if (Number.isFinite(battery) && battery < Number(cfg.alertThresholds.batteryLow)) {
          items.push({
            level: 'critical',
            title: 'Batterie faible',
            message: `La batterie est basse (${Math.round(battery)}%).`,
          });
        }

        const rssi = Number(t.rssi);
        if (Number.isFinite(rssi) && rssi < Number(cfg.alertThresholds.rssiLow)) {
          items.push({
            level: 'warn',
            title: 'Signal faible',
            message: `Le signal radio est faible (${Math.round(rssi)} dBm).`,
          });
        }

        const temp = Number(t.temp);
        if (Number.isFinite(temp) && temp > Number(cfg.alertThresholds.tempHigh)) {
          items.push({
            level: 'warn',
            title: 'Température élevée',
            message: `La température dépasse le seuil (${temp.toFixed(1)} °C).`,
          });
        }

        const hasGps =
          t.lat != null &&
          t.lng != null &&
          Number.isFinite(Number(t.lat)) &&
          Number.isFinite(Number(t.lng));

        if (!hasGps) {
          items.push({
            level: 'warn',
            title: 'GPS indisponible',
            message: 'Aucune position GPS exploitable n’est disponible actuellement.',
          });
        }

        if (items.length === 0) {
          items.push({
            level: 'info',
            title: 'Système stable',
            message: 'Aucune alerte importante détectée pour le device actif.',
          });
        }

        return items;
      })
    );

    this.vm$ = combineLatest([
      this.selectedDevice$,
      this.telemetry$,
      this.alerts$,
      this.settingsSubject(),
      this.status$,
      this.filtered$,
    ]).pipe(
      map(([device, telemetry, alerts, cfg, apiStatus, visibleDevices]) => {
        const nowSec = Math.floor(Date.now() / 1000);

        const freshnessSec =
          telemetry?.ts != null && Number.isFinite(Number(telemetry.ts))
            ? Math.max(0, nowSec - Number(telemetry.ts))
            : null;

        const isOnline =
          freshnessSec != null
            ? freshnessSec <= Number(cfg.alertThresholds.staleSeconds)
            : false;

        const hasGps =
          telemetry?.lat != null &&
          telemetry?.lng != null &&
          Number.isFinite(Number(telemetry.lat)) &&
          Number.isFinite(Number(telemetry.lng));

        return {
          device,
          telemetry,
          alertCount: alerts.length,
          freshnessSec,
          isOnline,
          hasGps,
          apiStatus,
          totalVisibleDevices: visibleDevices.length,
          cfg,
        };
      })
    );
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.sub.unsubscribe();
  }

  private settingsSubject(): Observable<DashboardConfig> {
    return new Observable<DashboardConfig>((observer) => {
      observer.next(this.settings.snapshot);
      observer.complete();
    });
  }

  private restartPolling(cfg: DashboardConfig): void {
    this.stopPolling();

    this.fleet.refreshFleetOnce();
    this.deviceStore.refresh();
    this.historyReload$.next(this.historyReload$.value + 1);

    if (!cfg.behavior.autoRefresh) {
      return;
    }

    const intervalMs = Math.max(
      3000,
      Number(cfg.behavior.refreshIntervalSec || 5) * 1000
    );

    this.pollingTimer = setInterval(() => {
      this.fleet.refreshFleetOnce();
      this.deviceStore.refresh();
      this.historyReload$.next(this.historyReload$.value + 1);
    }, intervalMs);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  onSelect(eui: string | null): void {
    if (!eui) return;
    this.fleet.select(String(eui).trim().toUpperCase());
    this.historyReload$.next(this.historyReload$.value + 1);
  }

  refresh(): void {
    this.deviceStore.refresh();
    this.fleet.refreshFleetOnce();
    this.historyReload$.next(this.historyReload$.value + 1);
  }

  trackByEui(_: number, d: DeviceSummary): string {
    return d?.device_eui ?? String(_);
  }

  fmt(v: any, decimals = 0, suffix = ''): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(decimals)}${suffix}`;
  }

  secondsAgoFromEpoch(tsSec: number | null | undefined): string {
    if (!tsSec) return '—';
    const s = Math.max(0, Math.round(Date.now() / 1000 - tsSec));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h} h`;
  }

  freshnessLabel(sec: number | null): string {
    if (sec == null) return 'Inconnue';
    if (sec < 10) return 'Temps réel';
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)} min`;
    return `${Math.floor(sec / 3600)} h`;
  }

  levelIcon(level: 'info' | 'warn' | 'critical'): string {
    switch (level) {
      case 'critical':
        return 'error';
      case 'warn':
        return 'warning';
      default:
        return 'info';
    }
  }

  levelLabel(level: 'info' | 'warn' | 'critical'): string {
    switch (level) {
      case 'critical':
        return 'Critique';
      case 'warn':
        return 'Avertissement';
      default:
        return 'Information';
    }
  }
}