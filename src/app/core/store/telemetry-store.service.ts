import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Subscription, timer, Observable } from 'rxjs';
import { MqttService } from '../mqtt/mqtt.service';
import { DashboardSettingsService } from '../settings/dashboard-settings.service';

export type DeviceSummary = {
  device_eui: string;
  last: {
    lat: number | null;
    lng: number | null;
    temp?: number | null;
    battery?: number | null;
    rssi?: number | null;
    ts?: number | null;
  };
  lastSeenMs: number;
  active: boolean;
};

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
    private settings: DashboardSettingsService
  ) {
    this.status$ = this.mqtt.status$;

    // ✅ prend staleSeconds depuis la config Settings
    this.sub.add(
      this.settings.config$.subscribe((cfg) => {
        const sec = Number(cfg?.alertThresholds?.staleSeconds);
        if (Number.isFinite(sec) && sec > 0) {
          this.activeTimeoutMs = sec * 1000;
        }
      })
    );

    // 1) écoute MQTT -> update Map
    this.sub.add(
      this.mqtt.telemetry$.subscribe((t) => {
        const eui = String(t?.device_eui || '').trim();
        if (!eui) return;

        const lat = this.numOrNull(t?.lat);
        const lng = this.numOrNull(t?.lng);

        const battery = this.numOrNull(t?.battery);
        const rssi = this.numOrNull(t?.rssi);
        const temp = this.numOrNull(t?.temp);
        const ts = this.numOrNull(t?.ts);

        const now = Date.now();
        const prev = this.devicesMap.get(eui);

        const next: DeviceSummary = {
          device_eui: eui,
          last: {
            lat: lat ?? prev?.last.lat ?? null,
            lng: lng ?? prev?.last.lng ?? null,
            battery: battery ?? prev?.last.battery ?? null,
            rssi: rssi ?? prev?.last.rssi ?? null,
            temp: temp ?? prev?.last.temp ?? null,
            ts: ts ?? prev?.last.ts ?? null,
          },
          lastSeenMs: now,
          active: true,
        };

        this.devicesMap.set(eui, next);

        if (!this.selectedSubject.value) {
          this.selectedSubject.next(eui);
        }

        this.emitDevices();
      })
    );

    // 2) recalcul actif/inactif
    this.sub.add(
      timer(0, 2000).subscribe(() => {
        const now = Date.now();
        let changed = false;

        for (const [eui, d] of this.devicesMap.entries()) {
          const active = now - d.lastSeenMs <= this.activeTimeoutMs;
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

  getDeviceSnapshot(eui: string): DeviceSummary | null {
    return this.devicesMap.get(eui) ?? null;
  }

  private emitDevices(): void {
    const arr = Array.from(this.devicesMap.values()).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.lastSeenMs - a.lastSeenMs;
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
