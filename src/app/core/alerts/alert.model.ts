export interface Alert {
  id: string;
  deviceEui: string;
  type: 'TEMP_HIGH' | 'BATTERY_LOW' | 'SIGNAL_LOW';
  message: string;
  value: number;
  threshold: number;
  ts: number;
}
