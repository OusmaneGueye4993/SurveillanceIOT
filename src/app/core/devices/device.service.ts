import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Device } from './device.model';

type ListResponse = Device[] | { devices?: Device[] } | { results?: Device[] };

@Injectable({ providedIn: 'root' })
export class DeviceService {
  private base = String(environment.apiBaseUrl || '').replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

  listMyDevices(): Observable<Device[]> {
    return this.http.get<ListResponse>(`${this.base}/v1/me/devices/`).pipe(
      map((res: any) => {
        if (Array.isArray(res)) return res as Device[];
        if (Array.isArray(res?.devices)) return res.devices as Device[];
        if (Array.isArray(res?.results)) return res.results as Device[];
        return [];
      })
    );
  }

  addMyDevice(payload: {
    device_eui: string;
    name?: string;
    description?: string;
    claim_code?: string; // ✅ NEW
  }): Observable<Device> {
    return this.http.post<Device>(`${this.base}/v1/me/devices/`, payload);
  }

  deleteMyDevice(deviceEui: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(
      `${this.base}/v1/me/devices/${encodeURIComponent(deviceEui)}/`
    );
  }

  setActive(deviceEui: string): Observable<Device> {
    return this.http.patch<Device>(
      `${this.base}/v1/me/devices/${encodeURIComponent(deviceEui)}/active/`,
      {}
    );
  }
}