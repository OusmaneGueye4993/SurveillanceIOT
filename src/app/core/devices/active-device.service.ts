import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Device } from './device.model';

const KEY = 'active.device_eui';

@Injectable({ providedIn: 'root' })
export class ActiveDeviceService {
  private subject = new BehaviorSubject<string | null>(this.read());
  activeEui$ = this.subject.asObservable();

  private read(): string | null {
    const v = localStorage.getItem(KEY);
    return v ? String(v).trim().toUpperCase() : null;
  }

  getActiveEui(): string | null {
    return this.subject.value;
  }

  setActiveEui(eui: string | null): void {
    const next = eui ? String(eui).trim().toUpperCase() : null;
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
    this.subject.next(next);
  }

  /** Synchronise localStorage avec ce que dit le backend (is_active). */
  syncFromDevices(devices: Device[]): void {
    const list = devices || [];

    // 1) priorité au device actif côté backend
    const backendActive = list.find((d) => !!d.is_active)?.device_eui;
    if (backendActive) {
      this.setActiveEui(backendActive);
      return;
    }

    // 2) sinon, garder la valeur locale seulement si elle existe encore
    const local = this.getActiveEui();
    if (local && list.some((d) => d.device_eui?.toUpperCase() === local)) return;

    // 3) sinon reset
    this.setActiveEui(null);
  }
}