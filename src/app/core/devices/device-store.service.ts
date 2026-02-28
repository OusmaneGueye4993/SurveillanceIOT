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

  /** Snapshot utile pour savoir si c'était le 1er device / si un actif existait */
  getSnapshot(): Device[] {
    return this.devicesSubject.value;
  }

  refresh(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.api
      .listMyDevices()
      .pipe(
        map((devices) =>
          (devices || []).map((d) => ({
            ...d,
            device_eui: String(d.device_eui || '').toUpperCase(),
          }))
        ),
        tap((normalized) => {
          this.devicesSubject.next(normalized);
          this.active.syncFromDevices(normalized);
        }),
        finalize(() => this.loadingSubject.next(false)),
        catchError((e) => {
          this.errorSubject.next(e?.error?.detail || 'Impossible de charger les appareils.');
          return of([] as Device[]);
        })
      )
      .subscribe();
  }

  /** ✅ Nouveau: ajout + refresh + auto-active si besoin */
addDevice(
  payload: { device_eui: string; name?: string; description?: string; claim_code?: string },
  opts?: { autoSetActiveIfNone?: boolean }
) {
  this.loadingSubject.next(true);
  this.errorSubject.next(null);

  const before = this.getSnapshot();
  const hadActiveBefore = before.some((d) => !!d.is_active);

  const body = {
    ...payload,
    device_eui: String(payload.device_eui || '').trim().toUpperCase(),
    name: (payload.name || '').trim(),
    description: (payload.description || '').trim(),
    claim_code: String(payload.claim_code || '').trim().toUpperCase(),
  };

  return this.api.addMyDevice(body).pipe(
    switchMap((created) => {
      const createdEui = String(created?.device_eui || body.device_eui).toUpperCase();

      if (opts?.autoSetActiveIfNone && !hadActiveBefore) {
        return this.api.setActive(createdEui).pipe(map(() => createdEui));
      }
      return of(createdEui);
    }),
    switchMap(() => this.api.listMyDevices()),
    map((devices) =>
      (devices || []).map((d) => ({
        ...d,
        device_eui: String(d.device_eui || '').toUpperCase(),
      }))
    ),
    tap((normalized) => {
      this.devicesSubject.next(normalized);
      this.active.syncFromDevices(normalized);
    }),
    map(() => void 0),
    finalize(() => this.loadingSubject.next(false)),
    catchError((e) => {
      const msg =
        e?.error?.detail ||
        e?.error?.claim_code?.[0] ||
        e?.error?.device_eui?.[0] ||
        'Ajout impossible.';
      this.errorSubject.next(msg);
      return throwError(() => e);
    })
  );
}

  delete(deviceEui: string): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const target = String(deviceEui || '').toUpperCase();

    this.api
      .deleteMyDevice(target)
      .pipe(
        switchMap(() => this.api.listMyDevices()),
        map((devices) =>
          (devices || []).map((d) => ({
            ...d,
            device_eui: String(d.device_eui || '').toUpperCase(),
          }))
        ),
        tap((normalized) => {
          // si on supprime l'actif -> la sync reset proprement
          this.devicesSubject.next(normalized);
          this.active.syncFromDevices(normalized);
        }),
        finalize(() => this.loadingSubject.next(false)),
        catchError((e) => {
          this.loadingSubject.next(false);
          this.errorSubject.next(e?.error?.detail || 'Suppression impossible.');
          return of([] as Device[]);
        })
      )
      .subscribe();
  }

  setActive(deviceEui: string): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const target = String(deviceEui || '').toUpperCase();

    this.api
      .setActive(target)
      .pipe(
        switchMap(() => this.api.listMyDevices()),
        map((devices) =>
          (devices || []).map((d) => ({
            ...d,
            device_eui: String(d.device_eui || '').toUpperCase(),
          }))
        ),
        tap((normalized) => {
          this.devicesSubject.next(normalized);
          this.active.syncFromDevices(normalized);
        }),
        finalize(() => this.loadingSubject.next(false)),
        catchError((e) => {
          this.loadingSubject.next(false);
          this.errorSubject.next(e?.error?.detail || 'Impossible de définir l’appareil actif.');
          return of([] as Device[]);
        })
      )
      .subscribe();
  }
}