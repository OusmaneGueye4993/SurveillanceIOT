import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TelemetryPoint {
  ts: number;
  lat: number;
  lng: number;
  temp?: number | null;
  battery?: number | null;
  rssi?: number | null;
  snr?: number | null;
}

export interface TelemetryHistoryResponse {
  device_eui: string;
  count: number;
  history: TelemetryPoint[];
}

export interface TelemetryLatestResponse {
  device_eui: string;
  ts: number;
  lat: number;
  lng: number;
  temp?: number | null;
  battery?: number | null;
  rssi?: number | null;
  snr?: number | null;
}

@Injectable({ providedIn: 'root' })
export class TelemetryApiService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  /**
   * ✅ Pro: supporte now:
   * - limit
   * - from (ts en secondes)
   * - to (ts en secondes)
   */
  getHistory(
  deviceEui: string,
  opts?: { limit?: number; fromTs?: number; toTs?: number }
): Observable<TelemetryHistoryResponse> {
  const limit = opts?.limit ?? 300;

  let params = new HttpParams().set('limit', String(limit));
  if (opts?.fromTs != null) params = params.set('from', String(opts.fromTs));
  if (opts?.toTs != null) params = params.set('to', String(opts.toTs));

  return this.http.get<TelemetryHistoryResponse>(
    `${this.base}/v1/telemetry/history/${encodeURIComponent(deviceEui)}/`,
    { params }
  );
}


  getLatest(deviceEui: string): Observable<TelemetryLatestResponse> {
    return this.http.get<TelemetryLatestResponse>(
      `${this.base}/v1/telemetry/latest/${encodeURIComponent(deviceEui)}/`
    );
  }
}
