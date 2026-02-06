import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

import { MqttService } from '../../core/mqtt/mqtt.service';
import { DashboardSettingsService } from '../../core/settings/dashboard-settings.service';
import { AlertsService, AlertItem } from '../../core/alerts/alerts.service';
import { DashboardConfig } from '../../core/settings/dashboard-config.model';
import { TelemetryApiService } from '../../core/api/telemetry-api.service';

import { MiniMapComponent } from '../../shared/mini-map/mini-map';
import { TelemetryChartComponent } from '../telemetry/telemetry';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MiniMapComponent,
    TelemetryChartComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit {
  /** MQTT (temps réel) */
  status$!: Observable<'disconnected' | 'connecting' | 'connected'>;
  telemetry$!: Observable<any>;

  /** Configuration UI */
  cfg$!: Observable<DashboardConfig>;

  /** Alertes */
  alerts$!: Observable<AlertItem[]>;

  /** Historique Django */
  deviceEui = '70B3D57ED0074DF2'; // ⚠️ remplace par ton vrai device
  history: any[] = [];

  constructor(
    private mqtt: MqttService,
    private settings: DashboardSettingsService,
    private alerts: AlertsService,
    private api: TelemetryApiService
  ) {
    this.status$ = this.mqtt.status$;
    this.telemetry$ = this.mqtt.telemetry$;
    this.cfg$ = this.settings.config$;
    this.alerts$ = this.alerts.alerts$;
  }

  ngOnInit(): void {
    /** 1️⃣ Charger l’historique depuis Django */
   this.api.getHistory(this.deviceEui, 300).subscribe(res => {
  this.history = res.history;
  console.log('HISTORY LEN =', this.history.length, 'FIRST=', this.history[0]);
});


    /** 2️⃣ Démarrer MQTT (temps réel) */
    this.mqtt.connect();
  }

  /** Formatage propre des valeurs */
  fmt(v: any, digits = 1): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(digits);
  }
}
