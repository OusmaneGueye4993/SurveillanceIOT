export interface Device {
  device_eui: string;
  name?: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
}