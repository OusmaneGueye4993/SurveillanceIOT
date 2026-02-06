import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TelemetryApiService {
  private BASE = 'http://localhost:8000/v1/telemetry';

  constructor(private http: HttpClient) {}

  getLatest(deviceEui: string) {
    return this.http.get<any>(`${this.BASE}/latest/${deviceEui}/`);
  }

  getHistory(deviceEui: string, limit = 500) {
    return this.http.get<any>(`${this.BASE}/history/${deviceEui}/?limit=${limit}`);
  }
}
