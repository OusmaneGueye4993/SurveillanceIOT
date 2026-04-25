export type DashboardChartType = 'line' | 'bar' | 'area';

export interface DashboardWidgetVisibility {
  temperature: boolean;
  battery: boolean;
  rssi: boolean;
  gps: boolean;
  alerts: boolean;
  history: boolean;
  fleet: boolean;
  miniMap: boolean;
}

export interface DashboardBehaviorConfig {
  autoRefresh: boolean;
  refreshIntervalSec: number;
  compactMode: boolean;
  chartType: DashboardChartType;
}

export interface DashboardAlertThresholds {
  batteryLow: number;
  tempHigh: number;
  rssiLow: number;
  staleSeconds: number;
}

export interface DashboardConfig {
  widgets: DashboardWidgetVisibility;
  behavior: DashboardBehaviorConfig;
  alertThresholds: DashboardAlertThresholds;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  widgets: {
    temperature: true,
    battery: true,
    rssi: true,
    gps: true,
    alerts: true,
    history: true,
    fleet: true,
    miniMap: true,
  },
  behavior: {
    autoRefresh: true,
    refreshIntervalSec: 5,
    compactMode: false,
    chartType: 'line',
  },
  alertThresholds: {
    batteryLow: 20,
    tempHigh: 40,
    rssiLow: -110,
    staleSeconds: 60,
  },
};