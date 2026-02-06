import { Injectable } from '@angular/core';
import { combineLatest, map, Observable, startWith } from 'rxjs';
import { MqttService } from '../mqtt/mqtt.service';
import { DashboardSettingsService } from '../settings/dashboard-settings.service';

export interface AlertItem {
  ts: number;
  level: 'info' | 'warn' | 'critical';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AlertsService {
  readonly alerts$: Observable<AlertItem[]>;

  constructor(
    private mqtt: MqttService,
    private settings: DashboardSettingsService
  ) {
    // Initialisation de alerts$ dans le constructeur
    this.alerts$ = combineLatest([
      this.mqtt.telemetry$.pipe(startWith(null)),
      this.settings.config$,
    ]).pipe(
      map(([t, cfg]) => {
        const now = Date.now();
        const thr = cfg.alertThresholds;
        const alerts: AlertItem[] = [];

        const battery = Number((t as any)?.battery);
        if (Number.isFinite(battery) && battery < thr.batteryLow) {
          alerts.push({ 
            ts: now, 
            level: 'critical', 
            message: `Batterie faible (${battery}%)` 
          });
        }

        const rssi = Number((t as any)?.rssi);
        if (Number.isFinite(rssi) && rssi < thr.rssiLow) {
          alerts.push({ 
            ts: now, 
            level: 'warn', 
            message: `Signal faible (RSSI ${rssi} dBm)` 
          });
        }

        const temp = Number((t as any)?.temp);
        if (Number.isFinite(temp) && temp > thr.tempHigh) {
          alerts.push({ 
            ts: now, 
            level: 'warn', 
            message: `Température élevée (${temp}°C)` 
          });
        }

        const tsValue = Number((t as any)?.ts); // Renommé pour éviter conflit
        if (Number.isFinite(tsValue)) {
          const ageSec = (now - tsValue * 1000) / 1000;
          if (ageSec > thr.staleSeconds) {
            alerts.push({ 
              ts: now, 
              level: 'critical', 
              message: `Données non mises à jour (${Math.round(ageSec)}s)` 
            });
          }
        }

        return alerts.slice(0, 3);
      })
    );
  }
}