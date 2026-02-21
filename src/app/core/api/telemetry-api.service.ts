import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TelemetryPoint } from '../models/telemetry.models';

export interface TelemetryHistoryResponse {
  device_eui: string;
  count: number;
  history: TelemetryPoint[];
}

export interface TelemetryLatestResponse extends TelemetryPoint {
  device_eui: string;
}

export interface DevicesListResponse {
  devices: Array<{
    device_eui: string;
    name?: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
  }>;
}

export interface TelemetryLatestAllItem extends TelemetryPoint {
  device_eui: string;
}

export interface TelemetryLatestAllResponse {
  count: number;
  items: TelemetryLatestAllItem[];
}

@Injectable({ providedIn: 'root' })
export class TelemetryApiService {
  private base = environment.apiBaseUrl; // ex: http://127.0.0.1:8000/api

  constructor(private http: HttpClient) {}

  private toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private normalizePoint(dto: any): TelemetryPoint {
    let ts = this.toNum(dto?.ts) ?? Math.floor(Date.now() / 1000);
    if (ts > 1_000_000_000_000) ts = Math.floor(ts / 1000); // ms -> s
    return {
      ts,
      lat: this.toNum(dto?.lat) ?? 0,
      lng: this.toNum(dto?.lng) ?? 0,
      temp: this.toNum(dto?.temp),
      battery: this.toNum(dto?.battery),
      rssi: this.toNum(dto?.rssi),
      snr: this.toNum(dto?.snr),
    };
  }

  /** GET /api/v1/devices/ */
  getDevices(): Observable<DevicesListResponse> {
    return this.http.get<DevicesListResponse>(`${this.base}/v1/devices/`);
  }

  /** GET /api/v1/telemetry/latest/ */
  getLatestAll(): Observable<TelemetryLatestAllResponse> {
    return this.http.get<any>(`${this.base}/v1/telemetry/latest/`).pipe(
      map((res) => {
        const items = Array.isArray(res?.items) ? res.items : [];
        return {
          count: Number(res?.count ?? items.length) || items.length,
          items: items.map((dto: any) => ({
            device_eui: String(dto?.device_eui ?? ''),
            ...this.normalizePoint(dto),
          })),
        } as TelemetryLatestAllResponse;
      })
    );
  }

  /** GET /api/v1/telemetry/latest/<device_eui>/ */
  getLatest(deviceEui: string): Observable<TelemetryLatestResponse> {
    return this.http
      .get<any>(`${this.base}/v1/telemetry/latest/${encodeURIComponent(deviceEui)}/`)
      .pipe(
        map((dto) => ({
          device_eui: String(dto?.device_eui ?? deviceEui),
          ...this.normalizePoint(dto),
        }))
      );
  }

  /** GET /api/v1/telemetry/history/<device_eui>/?limit&fromTs&toTs */
  getHistory(
    deviceEui: string,
    opts?: { limit?: number; fromTs?: number; toTs?: number }
  ): Observable<TelemetryHistoryResponse> {
    let params = new HttpParams();
    if (opts?.limit) params = params.set('limit', String(opts.limit));
    if (opts?.fromTs) params = params.set('fromTs', String(opts.fromTs));
    if (opts?.toTs) params = params.set('toTs', String(opts.toTs));

    return this.http
      .get<TelemetryHistoryResponse>(
        `${this.base}/v1/telemetry/history/${encodeURIComponent(deviceEui)}/`,
        { params }
      )
      .pipe(
        map((res) => ({
          ...res,
          history: Array.isArray(res?.history)
            ? res.history.map((p: any) => this.normalizePoint(p))
            : [],
        }))
      );
  }

  /** POST /api/v1/telemetry/ingest/ */
  ingest(payload: any): Observable<any> {
    return this.http.post(`${this.base}/v1/telemetry/ingest/`, payload);
  }
}