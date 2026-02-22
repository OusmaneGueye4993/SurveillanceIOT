import { Injectable, OnDestroy } from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  map,
  Subscription,
  timer,
  forkJoin,
  of,
  catchError,
} from 'rxjs';

import { DashboardSettingsService } from '../settings/dashboard-settings.service';
import { TelemetryApiService } from '../api/telemetry-api.service';
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
      const s = (q || '').trim().toLowerCase();
      if (!s) return devices;
      return devices.filter((d) => d.device_eui.toLowerCase().includes(s));
    })
  );

  private sub = new Subscription();

  // polling (ref-count)
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
        if (Number.isFinite(sec) && sec > 0) this.activeTimeoutMs = sec * 1000;
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

    // 4) Auto-select si rien de choisi (priorité: device actif backend/local)
if (!this.selectedSubject.value) {
  const list = Array.from(this.devicesMap.values());

  // priorité au flag isActive (backend)
  const backendActive = list.find((x) => x.isActive)?.device_eui;

  // sinon premier online, sinon premier tout court
  const firstActive = list.find((x) => x.active)?.device_eui;
  const firstAny = list[0]?.device_eui ?? null;

  this.selectedSubject.next(backendActive ?? firstActive ?? firstAny);
}

    forkJoin({
      devicesRes: this.api.getDevices().pipe(
        catchError((err) => {
          console.error('[Fleet] getDevices failed', err);
          return of({ devices: [] });
        })
      ),
      latestRes: this.api.getLatestAll().pipe(
        catchError((err) => {
          console.error('[Fleet] getLatestAll failed', err);
          return of({ count: 0, items: [] });
        })
      ),
    }).subscribe({
      next: ({ devicesRes, latestRes }) => {
        const nowMs = Date.now();

        // 1) Créer/mettre à jour les devices (même sans telemetry)
        for (const d of devicesRes.devices || []) {
          const eui = String(d?.device_eui || '').trim();
          if (!eui) continue;

          const prev = this.devicesMap.get(eui);
          const nextMeta = {
            name: (d?.name ?? null) as string | null,
            isActive: (d?.is_active ?? null) as boolean | null,     // ✅ snake -> camel
            createdAt: (d?.created_at ?? null) as string | null,    // ✅ snake -> camel
          };

          if (!prev) {
            this.devicesMap.set(eui, {
              device_eui: eui,
              ...nextMeta,

              lastTs: null,
              lastSeenMs: undefined,
              lat: null,
              lng: null,
              temp: null,
              battery: null,
              rssi: null,
              snr: null,
              active: false,
              last: {},
            });
          } else {
            this.devicesMap.set(eui, {
              ...prev,
              ...nextMeta,
            });
          }
        }

        // 2) Appliquer latest points
        for (const p of latestRes.items || []) {
          const eui = String((p as any)?.device_eui || '').trim();
          if (!eui) continue;

          const prev = this.devicesMap.get(eui);
          const lastSeenMs = p.ts ? p.ts * 1000 : nowMs;

          const next: DeviceSummary = {
            device_eui: eui,

            // garder metadata si déjà connue
            name: prev?.name ?? null,
            isActive: prev?.isActive ?? null,
            createdAt: prev?.createdAt ?? null,

            lastTs: p.ts ?? prev?.lastTs ?? null,
            lastSeenMs,

            // ⚠️ FleetMap lit d.last.lat/lng
            lat: Number.isFinite(p.lat) ? p.lat : prev?.lat ?? null,
            lng: Number.isFinite(p.lng) ? p.lng : prev?.lng ?? null,

            temp: p.temp ?? prev?.temp ?? null,
            battery: p.battery ?? prev?.battery ?? null,
            rssi: p.rssi ?? prev?.rssi ?? null,
            snr: p.snr ?? prev?.snr ?? null,

            active: true, // recalcul ensuite
            last: {
              ts: p.ts,
              lat: p.lat as any,
              lng: p.lng as any,
              temp: p.temp ?? null,
              battery: p.battery ?? null,
              rssi: p.rssi ?? null,
            },
          };

          this.devicesMap.set(eui, next);
        }

        // 3) Recalcul active/inactive (basé sur lastSeenMs)
        for (const [eui, d] of this.devicesMap.entries()) {
          const lastSeen = d.lastSeenMs ?? null;
          const active =
            lastSeen != null ? nowMs - lastSeen <= this.activeTimeoutMs : false;

          if (active !== d.active) {
            this.devicesMap.set(eui, { ...d, active });
          }
        }

        // 4) Auto-select si rien de choisi
        if (!this.selectedSubject.value) {
          const list = Array.from(this.devicesMap.values());
          const firstActive = list.find((x) => x.active);
          const firstAny = list[0];
          this.selectedSubject.next((firstActive ?? firstAny)?.device_eui ?? null);
        }

        this.emitDevices();

        const ok =
          (devicesRes.devices?.length ?? 0) > 0 ||
          (latestRes.items?.length ?? 0) > 0;
        this.statusSubject.next(ok ? 'connected' : 'disconnected');
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

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.pollSub) this.pollSub.unsubscribe();
  }
}