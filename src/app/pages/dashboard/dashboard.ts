import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { Observable, Subscription, combineLatest } from 'rxjs';
import { debounceTime, map, startWith } from 'rxjs/operators';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { TelemetryStoreService, DeviceSummary } from '../../core/store/telemetry-store.service';
import { DashboardSettingsService } from '../../core/settings/dashboard-settings.service';

import { FleetMapComponent } from '../../shared/fleet-map/fleet-map';

// ⚠️ garde tes composants existants
import { MiniMapComponent } from '../../shared/mini-map/mini-map';
import  { TelemetryChartComponent } from '../telemetry/telemetry';

type AlertItem = { level: 'critical' | 'warn'; message: string };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    FleetMapComponent,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FleetMapComponent,
    MiniMapComponent,
    TelemetryChartComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Fleet
  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;
  devices$!: Observable<DeviceSummary[]>;
  filtered$!: Observable<DeviceSummary[]>;
  selected$!: Observable<string | null>;

  searchCtrl = new FormControl<string>('', { nonNullable: true });

  // ✅ pour ton HTML existant : cfg$ doit exister
  cfg$!: Observable<any>;

  // ✅ pour ton HTML existant : telemetry$, alerts$, history
  telemetry$!: Observable<any | null>;
  alerts$!: Observable<AlertItem[]>;
  history: any[] = [];

  private sub = new Subscription();

  constructor(
    private fleet: TelemetryStoreService,
    private settings: DashboardSettingsService
  ) {}

  ngOnInit(): void {
    this.status$ = this.fleet.status$;
    this.devices$ = this.fleet.devices$;
    this.filtered$ = this.fleet.filtered$;
    this.selected$ = this.fleet.selected$;

    // ✅ map config$ -> cfg$ pour rester compatible avec ton template
    this.cfg$ = this.settings.config$;

    this.fleet.connectMqtt();

    // recherche
    this.sub.add(
      this.searchCtrl.valueChanges
        .pipe(startWith(this.searchCtrl.value), debounceTime(150))
        .subscribe((v) => this.fleet.setSearch(v))
    );

    // telemetry$ = snapshot du device sélectionné
    this.telemetry$ = combineLatest([this.selected$, this.devices$]).pipe(
      map(([eui, devices]) => {
        if (!eui) return null;
        const d = devices.find((x) => x.device_eui === eui);
        if (!d) return null;

        return {
          device_eui: d.device_eui,
          ts: d.last.ts ?? Math.floor(d.lastSeenMs / 1000),
          lat: d.last.lat,
          lng: d.last.lng,
          temp: d.last.temp,
          battery: d.last.battery,
          rssi: d.last.rssi,
        };
      })
    );

    // reset history quand on change de device
    this.sub.add(
      this.selected$.subscribe(() => {
        this.history = [];
      })
    );

    // construire history pour chart (accumulation sur le device sélectionné)
    this.sub.add(
      this.telemetry$.subscribe((t) => {
        if (!t) return;
        if (t.lat == null || t.lng == null) return;

        const last = this.history[this.history.length - 1];
        const same =
          last &&
          Math.abs(last.lat - t.lat) < 1e-7 &&
          Math.abs(last.lng - t.lng) < 1e-7;

        if (same) return;

        this.history = [...this.history, t].slice(-3000);
      })
    );

    // alerts (dépend des thresholds config)
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
          out.push({ level: 'warn', message: `Signal faible: ${Math.round(rssi)} dBm` });
        }

        const temp = Number(t.temp);
        if (Number.isFinite(temp) && Number.isFinite(tempHigh) && temp > tempHigh) {
          out.push({ level: 'warn', message: `Température élevée: ${temp.toFixed(1)}°C` });
        }

        return out;
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onSelect(eui: string) {
    this.fleet.select(eui);
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

  mapDevices(devices: DeviceSummary[]) {
    return devices.map((d) => ({
      device_eui: d.device_eui,
      active: d.active,
      last: { lat: d.last.lat, lng: d.last.lng },
    }));
  }
}
