export type ChartType = 'line' | 'bar' | 'area';

export type WidgetType =
  | 'kpi-battery'
  | 'kpi-temp'
  | 'kpi-rssi'
  | 'kpi-gps'
  | 'mini-map'
  | 'chart-telemetry'
  | 'alerts';

export interface DashboardWidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  enabled: boolean;
}

export interface AlertThresholds {
  batteryLow: number;
  rssiLow: number;
  tempHigh: number;
  staleSeconds: number;
}

export interface DashboardConfig {
  widgets: DashboardWidgetConfig[];
  chartType: ChartType;
  alertThresholds: AlertThresholds;
}