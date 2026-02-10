import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Subscription, timer, Observable } from 'rxjs';

import { MqttService } from '../mqtt/mqtt.service';
import { DashboardSettingsService } from '../settings/dashboard-settings.service';
import { TelemetryApiService } from '../api/telemetry-api.service';
import { DeviceSummary } from '../models/telemetry.models';

@Injectable({ providedIn: 'root' })
export class TelemetryStoreService implements OnDestroy {
  /** Timeout actif/inactif (ms) — vient de Settings (staleSeconds) */
  private activeTimeoutMs = 10_000;

  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;

  private devicesMap = new Map<string, DeviceSummary>();

  private devicesSubject = new BehaviorSubject<DeviceSummary[]>([]);
  devices$ = this.devicesSubject.asObservable();

  private selectedSubject = new BehaviorSubject<string | null>(null);
  selected$ = this.selectedSubject.asObservable();

  private searchSubject = new BehaviorSubject<string>('');
  search$ = this.searchSubject.asObservable();

  filtered$ = combineLatest([this.devices$, this.search$]).pipe(
    map(([devices, q]) => {
      const s = (q || '').trim().toLowerCase();
      if (!s) return devices;
      return devices.filter((d) => d.device_eui.toLowerCase().includes(s));
    })
  );

  private sub = new Subscription();

  constructor(
    private mqtt: MqttService,
    private settings: DashboardSettingsService,
    private api: TelemetryApiService
  ) {
    this.status$ = this.mqtt.status$;

    // staleSeconds depuis config
    this.sub.add(
      this.settings.config$.subscribe((cfg) => {
        const sec = Number(cfg?.alertThresholds?.staleSeconds);
        if (Number.isFinite(sec) && sec > 0) {
          this.activeTimeoutMs = sec * 1000;
        }
      })
    );

    // MQTT -> update devices
    this.sub.add(
      this.mqtt.telemetry$.subscribe((t: any) => {
        const eui = String(t?.device_eui || '').trim();
        if (!eui) return;

        const lat = this.numOrNull(t?.lat);
        const lng = this.numOrNull(t?.lng);

        const battery = this.numOrNull(t?.battery);
        const rssi = this.numOrNull(t?.rssi);
        const temp = this.numOrNull(t?.temp);
        const snr = this.numOrNull(t?.snr);

        let ts = this.numOrNull(t?.ts);
        if (ts != null && ts > 1_000_000_000_000) ts = Math.floor(ts / 1000); // ms -> s
        if (ts == null) ts = Math.floor(Date.now() / 1000);

        const nowMs = Date.now();
        const prev = this.devicesMap.get(eui);

        const next: DeviceSummary = {
          device_eui: eui,

          // normalisé
          lat: lat ?? prev?.lat ?? null,
          lng: lng ?? prev?.lng ?? null,
          lastTs: ts ?? prev?.lastTs ?? null,
          battery: battery ?? prev?.battery ?? null,
          rssi: rssi ?? prev?.rssi ?? null,
          temp: temp ?? prev?.temp ?? null,
          snr: snr ?? prev?.snr ?? null,

          active: true,

          // legacy compat
          lastSeenMs: nowMs,
          last: {
            ts: ts ?? prev?.last?.ts ?? undefined,
            lat: (lat ?? prev?.last?.lat ?? null) as any,
            lng: (lng ?? prev?.last?.lng ?? null) as any,
            battery: battery ?? prev?.last?.battery ?? null,
            rssi: rssi ?? prev?.last?.rssi ?? null,
            temp: temp ?? prev?.last?.temp ?? null,
          },
        };

        this.devicesMap.set(eui, next);

        // auto select first device
        if (!this.selectedSubject.value) {
          this.selectedSubject.next(eui);
        }

        this.emitDevices();

        // persist backend (méthode 1)
        this.api.ingest(t).subscribe({ error: () => {} });
      })
    );

    // recalcul actif/inactif
    this.sub.add(
      timer(0, 2000).subscribe(() => {
        const now = Date.now();
        let changed = false;

        for (const [eui, d] of this.devicesMap.entries()) {
          const lastSeen = d.lastSeenMs ?? now;
          const active = now - lastSeen <= this.activeTimeoutMs;
          if (active !== d.active) {
            this.devicesMap.set(eui, { ...d, active });
            changed = true;
          }
        }

        if (changed) this.emitDevices();
      })
    );
  }

  connectMqtt(): void {
    this.mqtt.connect();
  }

  setSearch(q: string): void {
    this.searchSubject.next(q ?? '');
  }

  select(eui: string): void {
    if (!eui) return;
    this.selectedSubject.next(eui);
  }

  private emitDevices(): void {
    const arr = Array.from(this.devicesMap.values()).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0);
    });
    this.devicesSubject.next(arr);
  }

  private numOrNull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
