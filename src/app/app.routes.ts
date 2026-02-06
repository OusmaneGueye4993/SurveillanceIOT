import { Routes } from '@angular/router';

import { ShellComponent } from './layout/shell/shell';

import { DashboardComponent } from './pages/dashboard/dashboard';
import { MapComponent } from './pages/map/map';
import { TelemetryChartComponent } from './pages/telemetry/telemetry';
import { AlertsComponent } from './pages/alerts/alerts';
import { HistoryComponent } from './pages/history/history';
import { SettingsComponent } from './pages/settings/settings';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'map', component: MapComponent },
      { path: 'telemetry', component: TelemetryChartComponent},
      { path: 'alerts', component: AlertsComponent },
      { path: 'history', component: HistoryComponent },
      { path: 'settings', component: SettingsComponent },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
