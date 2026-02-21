// src/app/core/models/telemetry.models.ts

export interface TelemetryPoint {
  ts: number; // epoch seconds
  lat: number;
  lng: number;
  temp?: number | null;
  battery?: number | null;
  rssi?: number | null;
  snr?: number | null;
}

export interface DeviceSummary {
  device_eui: string;

  // ✅ metadata (SaaS-ready)
  name?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;

  // ✅ champs normalisés (recommandés)
  lat: number | null;
  lng: number | null;
  lastTs: number | null; // epoch seconds
  temp?: number | null;
  battery?: number | null;
  rssi?: number | null;
  snr?: number | null;

  active: boolean;

  // ✅ compat legacy (pour éviter erreurs dans templates/pages existants)
  lastSeenMs?: number; // Date.now()
  last?: Partial<TelemetryPoint>; // {lat,lng,ts,temp,battery,rssi}
}