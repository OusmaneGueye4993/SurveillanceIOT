import { Injectable } from '@angular/core';
import { combineLatest, map, Observable } from 'rxjs';

import { DashboardSettingsService } from '../settings/dashboard-settings.service';
import { DeviceStoreService } from '../devices/device-store.service';
import { TelemetryStoreService } from '../store/telemetry-store.service';
import { Device } from '../devices/device.model';
import { DeviceSummary } from '../models/telemetry.models';

export interface AlertItem {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'critical';
  title: string;
  message: string;
  deviceEui?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AlertsService {
  readonly alerts$: Observable<AlertItem[]>;
  readonly hasAnyDevice$: Observable<boolean>;

  constructor(
    private settings: DashboardSettingsService,
    private deviceStore: DeviceStoreService,
    private telemetryStore: TelemetryStoreService
  ) {
    this.hasAnyDevice$ = this.deviceStore.devices$.pipe(
      map((devices) => (devices?.length ?? 0) > 0)
    );

    this.alerts$ = combineLatest([
      this.deviceStore.devices$,
      this.telemetryStore.devices$,
      this.telemetryStore.selected$,
      this.settings.config$,
    ]).pipe(
      map(([ownedDevices, fleetDevices, selectedEui, cfg]) => {
        const now = Date.now();
        const thresholds = cfg.alertThresholds;
        const alerts: AlertItem[] = [];

        const owned = ownedDevices ?? [];
        const fleet = fleetDevices ?? [];

        if (owned.length === 0) {
          alerts.push({
            id: 'no-device',
            ts: now,
            level: 'info',
            title: 'Aucun appareil',
            message: 'Ajoute un appareil pour commencer la surveillance.',
            deviceEui: null,
          });
          return alerts;
        }

        const activeOwned = owned.find((d) => !!d.is_active) ?? null;
        if (!activeOwned) {
          alerts.push({
            id: 'no-active-device',
            ts: now,
            level: 'warn',
            title: 'Aucun appareil actif',
            message: 'Définis un appareil actif depuis la page Devices pour un parcours plus clair.',
            deviceEui: null,
          });
        }

        const targetEui =
          String(selectedEui || activeOwned?.device_eui || owned[0]?.device_eui || '').trim().toUpperCase();

        const current = fleet.find(
          (d) => String(d.device_eui || '').trim().toUpperCase() === targetEui
        );

        if (!current) {
          alerts.push({
            id: `missing-telemetry-${targetEui || 'none'}`,
            ts: now,
            level: 'warn',
            title: 'Aucune télémétrie',
            message: targetEui
              ? `Aucune donnée temps réel disponible pour l’appareil ${targetEui}.`
              : 'Aucune donnée temps réel disponible.',
            deviceEui: targetEui || null,
          });
          return alerts;
        }

        const battery = Number(current.battery);
        if (Number.isFinite(battery) && battery < thresholds.batteryLow) {
          alerts.push({
            id: `battery-${current.device_eui}`,
            ts: now,
            level: 'critical',
            title: 'Batterie faible',
            message: `La batterie de ${current.device_eui} est basse (${Math.round(battery)}%).`,
            deviceEui: current.device_eui,
          });
        }

        const rssi = Number(current.rssi);
        if (Number.isFinite(rssi) && rssi < thresholds.rssiLow) {
          alerts.push({
            id: `rssi-${current.device_eui}`,
            ts: now,
            level: 'warn',
            title: 'Signal faible',
            message: `Le signal radio de ${current.device_eui} est faible (${Math.round(rssi)} dBm).`,
            deviceEui: current.device_eui,
          });
        }

        const temp = Number(current.temp);
        if (Number.isFinite(temp) && temp > thresholds.tempHigh) {
          alerts.push({
            id: `temp-${current.device_eui}`,
            ts: now,
            level: 'warn',
            title: 'Température élevée',
            message: `La température de ${current.device_eui} est élevée (${temp.toFixed(1)} °C).`,
            deviceEui: current.device_eui,
          });
        }

        const lastTs = Number(current.lastTs);
        if (Number.isFinite(lastTs)) {
          const ageSec = Math.max(0, Math.round(Date.now() / 1000 - lastTs));
          if (ageSec > thresholds.staleSeconds) {
            alerts.push({
              id: `stale-${current.device_eui}`,
              ts: now,
              level: 'critical',
              title: 'Données non mises à jour',
              message: `Aucune mise à jour récente pour ${current.device_eui} depuis ${ageSec} secondes.`,
              deviceEui: current.device_eui,
            });
          }
        } else {
          alerts.push({
            id: `no-last-ts-${current.device_eui}`,
            ts: now,
            level: 'warn',
            title: 'Aucune donnée récente',
            message: `L’appareil ${current.device_eui} est connu mais n’a pas encore de télémétrie exploitable.`,
            deviceEui: current.device_eui,
          });
        }

        if (alerts.length === 0) {
          alerts.push({
            id: `healthy-${current.device_eui}`,
            ts: now,
            level: 'info',
            title: 'Système stable',
            message: `Aucune alerte critique détectée pour ${current.device_eui}.`,
            deviceEui: current.device_eui,
          });
        }

        return alerts.sort((a, b) => {
          const rank = { critical: 0, warn: 1, info: 2 };
          return rank[a.level] - rank[b.level];
        });
      })
    );
  }
}