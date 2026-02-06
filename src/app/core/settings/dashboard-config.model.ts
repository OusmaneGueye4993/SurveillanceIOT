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
  batteryLow: number;      // %
  rssiLow: number;         // dBm (ex: -90)
  tempHigh: number;        // °C
  staleSeconds: number;    // pas de data depuis X secondes
}

export interface DashboardConfig {
  widgets: DashboardWidgetConfig[];
  chartType: ChartType;
  alertThresholds: AlertThresholds;
}
