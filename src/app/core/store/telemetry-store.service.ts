import { Injectable, OnDestroy } from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  map,
  Observable,
  Subscription,
  timer,
  forkJoin,
  of,
  catchError,
  tap,
} from 'rxjs';

import { DashboardSettingsService } from '../settings/dashboard-settings.service';
import { TelemetryApiService } from '../api/telemetry-api.service';
import { DeviceSummary } from '../models/telemetry.models';

type ConnStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * Store "fleet" (liste devices + dernier point) — backend-first (REST).
 * - Dashboard: liste + mini-map
 * - Map: markers + trajectoire via history(device)
 *
 * Polling ref-counté: startFleetPolling() / stopFleetPolling()
 */
@Injectable({ providedIn: 'root' })
export class TelemetryStoreService implements OnDestroy {
  /** Timeout actif/inactif (ms) — vient de Settings (staleSeconds) */
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
    // staleSeconds depuis config
    this.sub.add(
      this.settings.config$.subscribe((cfg) => {
        const sec = Number(cfg?.alertThresholds?.staleSeconds);
        if (Number.isFinite(sec) && sec > 0) {
          this.activeTimeoutMs = sec * 1000;
        }
      })
    );
  }

  /** Démarre un polling fleet (ref-counté). */
  startFleetPolling(intervalMs = 5000): void {
    this.pollIntervalMs = intervalMs;

    this.pollRefCount += 1;
    if (this.pollSub) return;

    this.statusSubject.next('connecting');

    this.pollSub = timer(0, this.pollIntervalMs).subscribe(() => {
      this.refreshFleetOnce();
    });
  }

  /** Stoppe le polling si plus personne ne le demande. */
  stopFleetPolling(): void {
    this.pollRefCount = Math.max(0, this.pollRefCount - 1);
    if (this.pollRefCount > 0) return;

    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }
    // On ne vide pas les données: on garde le dernier snapshot en UI.
    this.statusSubject.next('disconnected');
  }

  /** Recharge une fois la flotte (devices + latest) et met à jour le store. */
  refreshFleetOnce(): void {
    // éviter de spammer "connecting" à chaque tick
    if (this.statusSubject.value === 'disconnected') {
      this.statusSubject.next('connecting');
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
    })
      .pipe(
        tap(({ devicesRes, latestRes }) => {
          const nowMs = Date.now();

          // 1) s'assurer que tous les devices existent dans la map
          for (const d of devicesRes.devices || []) {
            const eui = String(d?.device_eui || '').trim();
            if (!eui) continue;

            if (!this.devicesMap.has(eui)) {
              this.devicesMap.set(eui, {
                device_eui: eui,
                lat: null,
                lng: null,
                lastTs: null,
                temp: null,
                battery: null,
                rssi: null,
                snr: null,
                active: false,
                lastSeenMs: undefined,
                last: {},
              });
            }
          }

          // 2) appliquer latest points
          for (const p of latestRes.items || []) {
            const eui = String((p as any)?.device_eui || '').trim();
            if (!eui) continue;

            const prev = this.devicesMap.get(eui);
            const lastSeenMs = p.ts ? p.ts * 1000 : nowMs;

            const next: DeviceSummary = {
              device_eui: eui,
              lat: Number.isFinite(p.lat) ? p.lat : prev?.lat ?? null,
              lng: Number.isFinite(p.lng) ? p.lng : prev?.lng ?? null,
              lastTs: p.ts ?? prev?.lastTs ?? null,
              temp: p.temp ?? prev?.temp ?? null,
              battery: p.battery ?? prev?.battery ?? null,
              rssi: p.rssi ?? prev?.rssi ?? null,
              snr: p.snr ?? prev?.snr ?? null,
              active: true, // recalculé juste après
              lastSeenMs,
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

          // 3) recalcul actif/inactif (pour tous)
          for (const [eui, d] of this.devicesMap.entries()) {
            const lastSeen = d.lastSeenMs ?? null;
            const active =
              lastSeen != null ? nowMs - lastSeen <= this.activeTimeoutMs : false;
            if (active !== d.active) {
              this.devicesMap.set(eui, { ...d, active });
            }
          }

          // 4) auto-select si rien de choisi
          if (!this.selectedSubject.value) {
            const candidates = Array.from(this.devicesMap.values());
            const firstActive = candidates.find((x) => x.active);
            const firstAny = candidates[0];
            if (firstActive) this.selectedSubject.next(firstActive.device_eui);
            else if (firstAny) this.selectedSubject.next(firstAny.device_eui);
          }

          this.emitDevices();

          // status
          const ok =
            (devicesRes.devices?.length ?? 0) > 0 ||
            (latestRes.items?.length ?? 0) > 0;
          this.statusSubject.next(ok ? 'connected' : 'disconnected');
        })
      )
      .subscribe({
        error: (err) => {
          console.error('[Fleet] refreshFleetOnce failed', err);
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