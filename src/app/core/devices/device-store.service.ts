import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Device } from './device.model';
import { DeviceService } from './device.service';

@Injectable({ providedIn: 'root' })
export class DeviceStoreService {
  private devicesSubject = new BehaviorSubject<Device[]>([]);
  devices$ = this.devicesSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  error$ = this.errorSubject.asObservable();

  constructor(private api: DeviceService) {}

  refresh(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.api.listMyDevices().subscribe({
      next: (devices) => {
        const normalized = (devices || []).map((d) => ({
          ...d,
          device_eui: String(d.device_eui || '').toUpperCase(),
        }));
        this.devicesSubject.next(normalized);
        this.loadingSubject.next(false);
      },
      error: (e) => {
        this.loadingSubject.next(false);
        this.errorSubject.next(e?.error?.detail || 'Impossible de charger les appareils.');
      },
    });
  }

  add(payload: { device_eui: string; name?: string; description?: string }): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const body = {
      ...payload,
      device_eui: payload.device_eui.trim().toUpperCase(),
      name: payload.name?.trim() || '',
      description: payload.description?.trim() || '',
    };

    this.api.addMyDevice(body).subscribe({
      next: () => {
        this.loadingSubject.next(false);
        this.refresh();
      },
      error: (e) => {
        this.loadingSubject.next(false);
        const msg =
          e?.error?.detail ||
          e?.error?.device_eui?.[0] ||
          e?.error?.name?.[0] ||
          'Ajout impossible.';
        this.errorSubject.next(msg);
      },
    });
  }

  delete(deviceEui: string): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.api.deleteMyDevice(deviceEui).subscribe({
      next: () => {
        this.loadingSubject.next(false);
        this.refresh();
      },
      error: (e) => {
        this.loadingSubject.next(false);
        this.errorSubject.next(e?.error?.detail || 'Suppression impossible.');
      },
    });
  }

  setActive(deviceEui: string): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.api.setActive(deviceEui).subscribe({
      next: () => {
        this.loadingSubject.next(false);
        this.refresh();
      },
      error: (e) => {
        this.loadingSubject.next(false);
        this.errorSubject.next(e?.error?.detail || 'Impossible de définir l’appareil actif.');
      },
    });
  }
}