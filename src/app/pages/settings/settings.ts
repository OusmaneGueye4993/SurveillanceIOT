import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { DashboardSettingsService } from './dashboard-settings.service';
import {
  DashboardChartType,
  DashboardConfig,
} from './dashboard-config.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './settings.html',
  styleUrls: ['./settings.scss'],
})
export class SettingsComponent implements OnInit {
  form!: FormGroup;
  saved = false;

  chartTypes: DashboardChartType[] = ['line', 'bar', 'area'];

  constructor(
    private fb: FormBuilder,
    private settings: DashboardSettingsService
  ) {}

  ngOnInit(): void {
    const cfg = this.settings.snapshot;

    this.form = this.fb.group({
      widgets: this.fb.group({
        temperature: [cfg.widgets.temperature],
        battery: [cfg.widgets.battery],
        rssi: [cfg.widgets.rssi],
        gps: [cfg.widgets.gps],
        alerts: [cfg.widgets.alerts],
        history: [cfg.widgets.history],
        fleet: [cfg.widgets.fleet],
        miniMap: [cfg.widgets.miniMap],
      }),
      behavior: this.fb.group({
        autoRefresh: [cfg.behavior.autoRefresh],
        refreshIntervalSec: [cfg.behavior.refreshIntervalSec],
        compactMode: [cfg.behavior.compactMode],
        chartType: [cfg.behavior.chartType],
      }),
      alertThresholds: this.fb.group({
        batteryLow: [cfg.alertThresholds.batteryLow],
        tempHigh: [cfg.alertThresholds.tempHigh],
        rssiLow: [cfg.alertThresholds.rssiLow],
        staleSeconds: [cfg.alertThresholds.staleSeconds],
      }),
    });

    this.form.valueChanges.subscribe(() => {
      this.saved = false;
    });
  }

  save(): void {
    const raw = this.form.getRawValue();

    const config: DashboardConfig = {
      widgets: {
        temperature: !!raw.widgets.temperature,
        battery: !!raw.widgets.battery,
        rssi: !!raw.widgets.rssi,
        gps: !!raw.widgets.gps,
        alerts: !!raw.widgets.alerts,
        history: !!raw.widgets.history,
        fleet: !!raw.widgets.fleet,
        miniMap: !!raw.widgets.miniMap,
      },
      behavior: {
        autoRefresh: !!raw.behavior.autoRefresh,
        refreshIntervalSec: Number(raw.behavior.refreshIntervalSec || 5),
        compactMode: !!raw.behavior.compactMode,
        chartType: raw.behavior.chartType as DashboardChartType,
      },
      alertThresholds: {
        batteryLow: Number(raw.alertThresholds.batteryLow || 20),
        tempHigh: Number(raw.alertThresholds.tempHigh || 40),
        rssiLow: Number(raw.alertThresholds.rssiLow || -110),
        staleSeconds: Number(raw.alertThresholds.staleSeconds || 60),
      },
    };

    this.settings.update(config);
    this.saved = true;

    setTimeout(() => {
      this.saved = false;
    }, 2500);
  }

  reset(): void {
    this.settings.reset();
    this.form.reset(this.settings.snapshot);
    this.saved = true;

    setTimeout(() => {
      this.saved = false;
    }, 2500);
  }
}