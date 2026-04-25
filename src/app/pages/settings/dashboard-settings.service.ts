import { Injectable } from '@angular/core';
import {
  DashboardConfig,
  DEFAULT_DASHBOARD_CONFIG,
} from './dashboard-config.model';

const STORAGE_KEY = 'dashboard.settings.v3';

@Injectable({
  providedIn: 'root',
})
export class DashboardSettingsService {
  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  private mergeWithDefaults(
    incoming?: Partial<DashboardConfig> | null
  ): DashboardConfig {
    return {
      widgets: {
        ...DEFAULT_DASHBOARD_CONFIG.widgets,
        ...(incoming?.widgets ?? {}),
      },
      behavior: {
        ...DEFAULT_DASHBOARD_CONFIG.behavior,
        ...(incoming?.behavior ?? {}),
      },
      alertThresholds: {
        ...DEFAULT_DASHBOARD_CONFIG.alertThresholds,
        ...(incoming?.alertThresholds ?? {}),
      },
    };
  }

  get snapshot(): DashboardConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.clone(DEFAULT_DASHBOARD_CONFIG);
      }

      const parsed = JSON.parse(raw) as Partial<DashboardConfig>;
      return this.mergeWithDefaults(parsed);
    } catch {
      return this.clone(DEFAULT_DASHBOARD_CONFIG);
    }
  }

  update(config: DashboardConfig): void {
    const safe = this.mergeWithDefaults(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  }

  reset(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(this.clone(DEFAULT_DASHBOARD_CONFIG))
    );
  }
}