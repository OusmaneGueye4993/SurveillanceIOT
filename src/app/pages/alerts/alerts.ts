import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs/operators';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { AlertsService } from '../../core/alerts/alerts.service';
import { DeviceStoreService } from '../../core/devices/device-store.service';
import { TelemetryStoreService } from '../../core/store/telemetry-store.service';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './alerts.html',
  styleUrl: './alerts.scss',
})
export class AlertsComponent {
  private alertsService = inject(AlertsService);
  private deviceStore = inject(DeviceStoreService);
  private telemetryStore = inject(TelemetryStoreService);

  alerts$ = this.alertsService.alerts$;
  hasAnyDevice$ = this.alertsService.hasAnyDevice$;
  selected$ = this.telemetryStore.selected$;

  criticalCount$ = this.alerts$.pipe(
    map((items) => items.filter((a) => a.level === 'critical').length)
  );

  warnCount$ = this.alerts$.pipe(
    map((items) => items.filter((a) => a.level === 'warn').length)
  );

  infoCount$ = this.alerts$.pipe(
    map((items) => items.filter((a) => a.level === 'info').length)
  );

  refresh(): void {
    this.deviceStore.refresh();
    this.telemetryStore.refreshFleetOnce();
  }

  levelIcon(level: 'info' | 'warn' | 'critical'): string {
    switch (level) {
      case 'critical':
        return 'error';
      case 'warn':
        return 'warning';
      default:
        return 'info';
    }
  }

  levelLabel(level: 'info' | 'warn' | 'critical'): string {
    switch (level) {
      case 'critical':
        return 'Critique';
      case 'warn':
        return 'Avertissement';
      default:
        return 'Information';
    }
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}