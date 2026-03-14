import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';

import { Device } from './device.model';
import { DeviceService } from './device.service';
import { ActiveDeviceService } from './active-device.service';

type AddOptions = {
  autoSetActiveIfNone?: boolean;
};

@Injectable({ providedIn: 'root' })
export class DeviceStoreService {
  private devicesSubject = new BehaviorSubject<Device[]>([]);
  devices$ = this.devicesSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  error$ = this.errorSubject.asObservable();

  constructor(private api: DeviceService, private active: ActiveDeviceService) {}

  getSnapshot(): Device[] {
    return this.devicesSubject.value;
  }

  private normalizeDevices(devices: Device[]): Device[] {
    return (devices || []).map((d) => ({
      ...d,
      device_eui: String(d.device_eui || '').trim().toUpperCase(),
      name: d.name ?? null,
      description: d.description ?? null,
      is_active: !!d.is_active,
      created_at: d.created_at ?? undefined,
    }));
  }

  refresh(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.api
      .listMyDevices()
      .pipe(
        map((devices) => this.normalizeDevices(devices)),
        tap((normalized) => {
          this.devicesSubject.next(normalized);
          this.active.syncFromDevices(normalized);
        }),
        catchError((e) => {
          this.errorSubject.next(e?.error?.detail || 'Impossible de charger les appareils.');
          this.devicesSubject.next([]);
          return of([] as Device[]);
        }),
        finalize(() => this.loadingSubject.next(false))
      )
      .subscribe();
  }

  addDevice(
    payload: { device_eui: string; name?: string; description?: string; claim_code?: string },
    opts?: AddOptions
  ): Observable<void> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const before = this.getSnapshot();
    const hadActiveBefore = before.some((d) => !!d.is_active);

    const body = {
      ...payload,
      device_eui: String(payload.device_eui || '').trim().toUpperCase(),
      name: String(payload.name || '').trim(),
      description: String(payload.description || '').trim(),
      claim_code: String(payload.claim_code || '').trim().toUpperCase(),
    };

    return this.api.addMyDevice(body).pipe(
      switchMap((created) => {
        const createdEui = String(created?.device_eui || body.device_eui).trim().toUpperCase();

        if (opts?.autoSetActiveIfNone && !hadActiveBefore) {
          return this.api.setActive(createdEui).pipe(map(() => createdEui));
        }

        return of(createdEui);
      }),
      switchMap(() => this.api.listMyDevices()),
      map((devices) => this.normalizeDevices(devices)),
      tap((normalized) => {
        this.devicesSubject.next(normalized);
        this.active.syncFromDevices(normalized);
      }),
      map(() => void 0),
      catchError((e) => {
        const msg =
          e?.error?.detail ||
          e?.error?.claim_code?.[0] ||
          e?.error?.device_eui?.[0] ||
          'Ajout impossible.';
        this.errorSubject.next(msg);
        return throwError(() => e);
      }),
      finalize(() => this.loadingSubject.next(false))
    );
  }

  delete(deviceEui: string): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const target = String(deviceEui || '').trim().toUpperCase();

    this.api
      .deleteMyDevice(target)
      .pipe(
        switchMap(() => this.api.listMyDevices()),
        map((devices) => this.normalizeDevices(devices)),
        tap((normalized) => {
          this.devicesSubject.next(normalized);
          this.active.syncFromDevices(normalized);
        }),
        catchError((e) => {
          this.errorSubject.next(e?.error?.detail || 'Suppression impossible.');
          return of([] as Device[]);
        }),
        finalize(() => this.loadingSubject.next(false))
      )
      .subscribe();
  }

  setActive(deviceEui: string): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const target = String(deviceEui || '').trim().toUpperCase();

    this.api
      .setActive(target)
      .pipe(
        switchMap(() => this.api.listMyDevices()),
        map((devices) => this.normalizeDevices(devices)),
        tap((normalized) => {
          this.devicesSubject.next(normalized);
          this.active.syncFromDevices(normalized);
        }),
        catchError((e) => {
          this.errorSubject.next(e?.error?.detail || 'Impossible de définir l’appareil actif.');
          return of([] as Device[]);
        }),
        finalize(() => this.loadingSubject.next(false))
      )
      .subscribe();
  }
}