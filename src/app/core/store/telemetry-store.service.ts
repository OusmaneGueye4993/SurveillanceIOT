import { Injectable, OnDestroy } from '@angular/core';
import {
  BehaviorSubject,
  Subscription,
  timer,
  forkJoin,
  of,
  catchError,
  combineLatest,
  map,
} from 'rxjs';

import { DashboardSettingsService } from '../settings/dashboard-settings.service';
import {
  DevicesListResponse,
  TelemetryApiService,
  TelemetryLatestAllResponse,
} from '../api/telemetry-api.service';
import { DeviceSummary } from '../models/telemetry.models';

type ConnStatus = 'disconnected' | 'connecting' | 'connected';

@Injectable({ providedIn: 'root' })
export class TelemetryStoreService implements OnDestroy {
  private activeTimeoutMs = 10_000;

  private statusSubject = new BehaviorSubject<ConnStatus>('disconnected');
  status$ = this.statusSubject.asObservable();

  private devicesMap = new Map<string, DeviceSummary>();

  private devicesSubject = new BehaviorSubject<DeviceSummary[]>([]);
  devices$ = this.devicesSubject.asObservable();

  private selectedSubject = new BehaviorSubject<string | null>(null);
  selected$ = this.selectedSubject.asObservable();

  private searchSubject = new BehaviorSubject<string>('');
  search$ = this.searchSubject.asObservable();

  filtered$ = combineLatest([this.devices$, this.search$]).pipe(
    map(([devices, q]) => {
      const s = String(q || '').trim().toLowerCase();
      if (!s) return devices;

      return devices.filter((d) => {
        const eui = String(d.device_eui || '').toLowerCase();
        const name = String(d.name || '').toLowerCase();
        return eui.includes(s) || name.includes(s);
      });
    })
  );

  private sub = new Subscription();

  private pollSub: Subscription | null = null;
  private pollRefCount = 0;
  private pollIntervalMs = 5000;

  constructor(
    private settings: DashboardSettingsService,
    private api: TelemetryApiService
  ) {
    this.sub.add(
      this.settings.config$.subscribe((cfg) => {
        const sec = Number(cfg?.alertThresholds?.staleSeconds);
        if (Number.isFinite(sec) && sec > 0) {
          this.activeTimeoutMs = sec * 1000;
        }
      })
    );
  }

  startFleetPolling(intervalMs = 5000): void {
    this.pollIntervalMs = intervalMs;
    this.pollRefCount += 1;

    if (this.pollSub) return;

    this.statusSubject.next('connecting');

    this.pollSub = timer(0, this.pollIntervalMs).subscribe(() => {
      this.refreshFleetOnce();
    });
  }

  stopFleetPolling(): void {
    this.pollRefCount = Math.max(0, this.pollRefCount - 1);

    if (this.pollRefCount > 0) return;

    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }

    this.statusSubject.next('disconnected');
  }

  refreshFleetOnce(): void {
    forkJoin({
      devicesRes: this.api.getDevices().pipe(
        catchError((err) => {
          console.error('[Fleet] getDevices failed', err);
          return of({ devices: [] } as DevicesListResponse);
        })
      ),
      latestRes: this.api.getLatestAll().pipe(
        catchError((err) => {
          console.error('[Fleet] getLatestAll failed', err);
          return of({ count: 0, items: [] } as TelemetryLatestAllResponse);
        })
      ),
    }).subscribe({
      next: ({ devicesRes, latestRes }) => {
        const nowMs = Date.now();

        this.devicesMap.clear();

        for (const d of devicesRes.devices || []) {
          const eui = String(d?.device_eui || '').trim().toUpperCase();
          if (!eui) continue;

          this.devicesMap.set(eui, {
            device_eui: eui,
            name: (d?.name ?? null) as string | null,
            isActive: (d?.is_active ?? null) as boolean | null,
            createdAt: (d?.created_at ?? null) as string | null,
            lat: null,
            lng: null,
            lastTs: null,
            lastSeenMs: undefined,
            temp: null,
            battery: null,
            rssi: null,
            snr: null,
            active: false,
            last: {},
          });
        }

        for (const p of latestRes.items || []) {
          const eui = String((p as any)?.device_eui || '').trim().toUpperCase();
          if (!eui) continue;

          const prev = this.devicesMap.get(eui);

          const lastTs = Number.isFinite(Number(p.ts)) ? Number(p.ts) : null;
          const lastSeenMs = lastTs ? lastTs * 1000 : undefined;
          const lat = Number.isFinite(Number(p.lat)) ? Number(p.lat) : null;
          const lng = Number.isFinite(Number(p.lng)) ? Number(p.lng) : null;

          const next: DeviceSummary = {
            device_eui: eui,
            name: prev?.name ?? null,
            isActive: prev?.isActive ?? null,
            createdAt: prev?.createdAt ?? null,

            lat,
            lng,
            lastTs,
            lastSeenMs,

            temp: p.temp ?? prev?.temp ?? null,
            battery: p.battery ?? prev?.battery ?? null,
            rssi: p.rssi ?? prev?.rssi ?? null,
            snr: p.snr ?? prev?.snr ?? null,

            active: false,
            last: {
              ts: lastTs ?? undefined,
              lat: lat ?? undefined,
              lng: lng ?? undefined,
              temp: p.temp ?? null,
              battery: p.battery ?? null,
              rssi: p.rssi ?? null,
              snr: p.snr ?? null,
            },
          };

          this.devicesMap.set(eui, next);
        }

        for (const [eui, d] of this.devicesMap.entries()) {
          const active =
            d.lastSeenMs != null ? nowMs - d.lastSeenMs <= this.activeTimeoutMs : false;

          this.devicesMap.set(eui, {
            ...d,
            active,
          });
        }

        this.emitDevices();
        this.syncSelectedWithDevices();

        const hasAnyDevices = this.devicesMap.size > 0;
        this.statusSubject.next(hasAnyDevices ? 'connected' : 'disconnected');
      },
      error: (err) => {
        console.error('[Fleet] refresh failed', err);
        this.statusSubject.next('disconnected');
      },
    });
  }

  setSearch(q: string): void {
    this.searchSubject.next(q ?? '');
  }

  select(eui: string): void {
    const next = String(eui || '').trim().toUpperCase();
    if (!next) return;
    this.selectedSubject.next(next);
  }

  private syncSelectedWithDevices(): void {
    const list = Array.from(this.devicesMap.values());
    const current = this.selectedSubject.value;

    if (current && list.some((d) => d.device_eui === current)) {
      return;
    }

    const backendActive = list.find((d) => d.isActive)?.device_eui ?? null;
    const firstOnline = list.find((d) => d.active)?.device_eui ?? null;
    const firstAny = list[0]?.device_eui ?? null;

    this.selectedSubject.next(backendActive ?? firstOnline ?? firstAny);
  }

  private emitDevices(): void {
    const arr = Array.from(this.devicesMap.values()).sort((a, b) => {
      const aBackend = !!a.isActive;
      const bBackend = !!b.isActive;

      if (aBackend !== bBackend) return aBackend ? -1 : 1;
      if (a.active !== b.active) return a.active ? -1 : 1;

      return (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0);
    });

    this.devicesSubject.next(arr);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();

    if (this.pollSub) {
      this.pollSub.unsubscribe();
    }
  }
}