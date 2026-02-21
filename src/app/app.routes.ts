import { Routes } from '@angular/router';

import { ShellComponent } from './layout/shell/shell';
import { authGuard, publicOnlyGuard } from './core/auth/auth.guard';

import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';

import { DashboardComponent } from './pages/dashboard/dashboard';
import { MapComponent } from './pages/map/map';
import { TelemetryChartComponent } from './pages/telemetry/telemetry';
import { AlertsComponent } from './pages/alerts/alerts';
import { HistoryComponent } from './pages/history/history';
import { SettingsComponent } from './pages/settings/settings';

export const routes: Routes = [

  // 🔓 Routes publiques
  { path: 'login', component: LoginComponent, canActivate: [publicOnlyGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [publicOnlyGuard] },

  // 🔐 Routes protégées
  {
    path: '',
    component: ShellComponent,
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'map', component: MapComponent },
      { path: 'telemetry', component: TelemetryChartComponent },
      { path: 'alerts', component: AlertsComponent },
      { path: 'history', component: HistoryComponent },
      { path: 'settings', component: SettingsComponent },
    ],
  },

  // 🌍 Toute URL inconnue → login
  { path: '**', redirectTo: 'login' },
];