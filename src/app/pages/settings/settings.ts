import { Component } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { DashboardSettingsService } from '../../core/settings/dashboard-settings.service';
import { ChartType, DashboardConfig } from '../../core/settings/dashboard-config.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    AsyncPipe, NgIf, NgFor,
    ReactiveFormsModule,
    DragDropModule,
    MatCardModule, MatSlideToggleModule, MatButtonModule,
    MatSelectModule, MatFormFieldModule, MatInputModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent {
  cfg$;
  form;

  constructor(
    private settings: DashboardSettingsService,
    private fb: FormBuilder
  ) {
    // ✅ config$ (pas configs)
    this.cfg$ = this.settings.config$;

    const cfg = this.settings.snapshot;

    // ✅ form créé après injection de fb
    this.form = this.fb.group({
      chartType: this.fb.control<ChartType>(cfg.chartType),
      batteryLow: this.fb.control<number>(cfg.alertThresholds.batteryLow),
      rssiLow: this.fb.control<number>(cfg.alertThresholds.rssiLow),
      tempHigh: this.fb.control<number>(cfg.alertThresholds.tempHigh),
      staleSeconds: this.fb.control<number>(cfg.alertThresholds.staleSeconds),
    });
  }

  drop(event: CdkDragDrop<DashboardConfig['widgets']>, cfg: DashboardConfig) {
    const widgets = [...cfg.widgets];
    moveItemInArray(widgets, event.previousIndex, event.currentIndex);
    this.settings.update({ ...cfg, widgets });
  }

  toggleWidget(cfg: DashboardConfig, index: number, enabled: boolean) {
    const widgets = cfg.widgets.map((w, i) => (i === index ? { ...w, enabled } : w));
    this.settings.update({ ...cfg, widgets });
  }

  saveForm(cfg: DashboardConfig) {
    const v = this.form.getRawValue();
    this.settings.update({
      ...cfg,
      chartType: (v.chartType ?? cfg.chartType) as ChartType,
      alertThresholds: {
        batteryLow: Number(v.batteryLow ?? cfg.alertThresholds.batteryLow),
        rssiLow: Number(v.rssiLow ?? cfg.alertThresholds.rssiLow),
        tempHigh: Number(v.tempHigh ?? cfg.alertThresholds.tempHigh),
        staleSeconds: Number(v.staleSeconds ?? cfg.alertThresholds.staleSeconds),
      },
    });
  }

  reset() {
    this.settings.reset();
    const cfg = this.settings.snapshot;
    this.form.patchValue({
      chartType: cfg.chartType,
      batteryLow: cfg.alertThresholds.batteryLow,
      rssiLow: cfg.alertThresholds.rssiLow,
      tempHigh: cfg.alertThresholds.tempHigh,
      staleSeconds: cfg.alertThresholds.staleSeconds,
    });
  }
}
