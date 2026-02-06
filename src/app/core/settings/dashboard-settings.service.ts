import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DashboardConfig } from './dashboard-config.model';

const STORAGE_KEY = 'drone.dashboard.config.v1';

const DEFAULT_CONFIG: DashboardConfig = {
  widgets: [
    { id: 'w1', type: 'kpi-battery', title: 'Batterie', enabled: true },
    { id: 'w2', type: 'kpi-temp', title: 'Température', enabled: true },
    { id: 'w3', type: 'kpi-rssi', title: 'Signal (RSSI)', enabled: true },
    { id: 'w4', type: 'kpi-gps', title: 'Position GPS', enabled: true },
    { id: 'w5', type: 'mini-map', title: 'Mini-carte', enabled: true },
    { id: 'w6', type: 'chart-telemetry', title: 'Graphe', enabled: true },
    { id: 'w7', type: 'alerts', title: 'Alertes', enabled: true },
  ],
  chartType: 'line',
  alertThresholds: {
    batteryLow: 20,
    rssiLow: -90,
    tempHigh: 60,
    staleSeconds: 10,
  },
};

function safeParse(json: string | null): DashboardConfig | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DashboardConfig;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class DashboardSettingsService {
  private readonly _config$ = new BehaviorSubject<DashboardConfig>(this.load());
  readonly config$ = this._config$.asObservable();

  get snapshot(): DashboardConfig {
    return this._config$.value;
  }

  update(next: DashboardConfig) {
    this._config$.next(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  reset() {
    this.update(DEFAULT_CONFIG);
  }

  private load(): DashboardConfig {
    const loaded = safeParse(localStorage.getItem(STORAGE_KEY));
    return loaded ?? DEFAULT_CONFIG;
  }
}
