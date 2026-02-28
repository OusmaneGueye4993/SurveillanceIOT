import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { Observable, Subscription, combineLatest } from 'rxjs';
import { debounceTime, map, startWith } from 'rxjs/operators';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';

import { TelemetryStoreService } from '../../core/store/telemetry-store.service';
import { DashboardSettingsService } from '../../core/settings/dashboard-settings.service';
import { DeviceStoreService } from '../../core/devices/device-store.service';

import { MiniMapComponent } from '../../shared/mini-map/mini-map';
import { DeviceSummary } from '../../core/models/telemetry.models';

type AlertItem = { level: 'critical' | 'warn'; message: string };

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

    MiniMapComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private fleet = inject(TelemetryStoreService);
  private settings = inject(DashboardSettingsService);
  private deviceStore = inject(DeviceStoreService);

  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;
  devices$!: Observable<DeviceSummary[]>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;

  // multi-user devices (source de vérité: est-ce que le user a des devices ?)
  myDevices$ = this.deviceStore.devices$;
  myDevicesLoading$ = this.deviceStore.loading$;
  myDevicesError$ = this.deviceStore.error$;
  hasAnyDevice$ = this.myDevices$.pipe(map((list) => (list?.length ?? 0) > 0));

  searchCtrl = new FormControl<string>('', { nonNullable: true });

  cfg$!: Observable<any>;

  selectedDevice$!: Observable<DeviceSummary | null>;
  telemetry$!: Observable<{
    device_eui: string;
    ts: number | null;
    lat: number | null;
    lng: number | null;
    temp: number | null;
    battery: number | null;
    rssi: number | null;
  } | null>;

  alerts$!: Observable<AlertItem[]>;

  private sub = new Subscription();

  ngOnInit(): void {
    // charge liste devices du user
    this.deviceStore.refresh();

    // flotte (télémétrie)
    this.status$ = this.fleet.status$;
    this.devices$ = this.fleet.devices$;
    this.filtered$ = this.fleet.filtered$;
    this.selected$ = this.fleet.selected$;

    this.cfg$ = this.settings.config$;

    // polling flotte
    this.fleet.startFleetPolling(5000);

    // search
    this.sub.add(
      this.searchCtrl.valueChanges
        .pipe(startWith(this.searchCtrl.value), debounceTime(150))
        .subscribe((v) => this.fleet.setSearch(v))
    );

    // device sélectionné
    this.selectedDevice$ = combineLatest([this.selected$, this.devices$]).pipe(
      map(([eui, devices]) => {
        if (!eui) return null;
        return devices.find((x) => x.device_eui === eui) ?? null;
      })
    );

    // point courant
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
          temp: (d.temp ?? d.last?.temp ?? null) as any,
          battery: (d.battery ?? d.last?.battery ?? null) as any,
          rssi: (d.rssi ?? d.last?.rssi ?? null) as any,
        };
      })
    );

    // alertes (compact)
    this.alerts$ = combineLatest([this.telemetry$, this.cfg$]).pipe(
      map(([t, cfg]) => {
        const out: AlertItem[] = [];
        if (!t || !cfg?.alertThresholds) return out;

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

        return out.slice(0, 3); // compact
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.fleet.stopFleetPolling();
  }

  onSelect(eui: string): void {
    this.fleet.select(eui);
  }

  trackByEui(_: number, d: DeviceSummary): string {
    return d.device_eui;
  }

  fmt(v: any, digits = 0): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(digits);
  }

  secondsAgo(lastSeenMs?: number | null): string {
    if (!lastSeenMs) return '—';
    const deltaMs = Date.now() - lastSeenMs;
    if (deltaMs <= 0) return '0s';

    const s = Math.floor(deltaMs / 1000);
    if (s < 60) return `${s}s`;

    const m = Math.floor(s / 60);
    if (m < 60) return `${m}min`;

    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;

    const d = Math.floor(h / 24);
    return `${d}j`;
  }
}