import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DashboardConfig, DashboardWidgetConfig, WidgetType } from './dashboard-config.model';

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

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function safeParse(json: string | null): any | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isWidgetType(x: any): x is WidgetType {
  return (
    x === 'kpi-battery' ||
    x === 'kpi-temp' ||
    x === 'kpi-rssi' ||
    x === 'kpi-gps' ||
    x === 'mini-map' ||
    x === 'chart-telemetry' ||
    x === 'alerts'
  );
}

function titleFor(type: WidgetType): string {
  switch (type) {
    case 'kpi-battery': return 'Batterie';
    case 'kpi-temp': return 'Température';
    case 'kpi-rssi': return 'Signal (RSSI)';
    case 'kpi-gps': return 'Position GPS';
    case 'mini-map': return 'Mini-carte';
    case 'chart-telemetry': return 'Graphe';
    case 'alerts': return 'Alertes';
  }
}

function normalizeConfig(raw: any): DashboardConfig | null {
  if (!raw || typeof raw !== 'object') return null;

  const base = clone(DEFAULT_CONFIG);

  // chartType
  const chartType = raw.chartType;
  if (chartType === 'line' || chartType === 'bar' || chartType === 'area') {
    base.chartType = chartType;
  }

  // alertThresholds
  const at = raw.alertThresholds ?? {};
  base.alertThresholds = {
    batteryLow: Number.isFinite(Number(at.batteryLow)) ? Number(at.batteryLow) : base.alertThresholds.batteryLow,
    rssiLow: Number.isFinite(Number(at.rssiLow)) ? Number(at.rssiLow) : base.alertThresholds.rssiLow,
    tempHigh: Number.isFinite(Number(at.tempHigh)) ? Number(at.tempHigh) : base.alertThresholds.tempHigh,
    staleSeconds: Number.isFinite(Number(at.staleSeconds)) ? Number(at.staleSeconds) : base.alertThresholds.staleSeconds,
  };

  // widgets (ordre sauvegardé + réparation)
  const rawWidgets: any[] = Array.isArray(raw.widgets) ? raw.widgets : [];
  const cleaned: DashboardWidgetConfig[] = [];

  for (const w of rawWidgets) {
    if (!w || typeof w !== 'object') continue;
    if (!isWidgetType(w.type)) continue;

    cleaned.push({
      id: typeof w.id === 'string' ? w.id : `w_${w.type}`,
      type: w.type,
      title: typeof w.title === 'string' ? w.title : titleFor(w.type),
      enabled: typeof w.enabled === 'boolean' ? w.enabled : true,
    });
  }

  // ajouter widgets manquants
  const have = new Set(cleaned.map((w) => w.type));
  for (const dw of DEFAULT_CONFIG.widgets) {
    if (!have.has(dw.type)) cleaned.push(clone(dw));
  }

  // dédupliquer par type
  const seen = new Set<WidgetType>();
  base.widgets = cleaned.filter((w) => {
    if (seen.has(w.type)) return false;
    seen.add(w.type);
    return true;
  });

  return base;
}

@Injectable({ providedIn: 'root' })
export class DashboardSettingsService {
  private readonly _config$ = new BehaviorSubject<DashboardConfig>(this.load());
  readonly config$ = this._config$.asObservable();

  get snapshot(): DashboardConfig {
    return this._config$.value;
  }

  update(next: DashboardConfig) {
    const safe = normalizeConfig(next) ?? clone(DEFAULT_CONFIG);
    this._config$.next(safe);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  }

  reset() {
    const fresh = clone(DEFAULT_CONFIG);
    this._config$.next(fresh);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  }

  private load(): DashboardConfig {
    const raw = safeParse(localStorage.getItem(STORAGE_KEY));
    return normalizeConfig(raw) ?? clone(DEFAULT_CONFIG);
  }
}