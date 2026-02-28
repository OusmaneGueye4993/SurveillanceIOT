import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AsyncPipe, NgStyle, CommonModule } from '@angular/common';

import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '../../core/auth/auth.service';

type NavItem = {
  label: string;
  icon: string;
  to: string;
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule, // ✅ rend *ngFor/*ngIf disponibles
    RouterModule,
    AsyncPipe,
    NgStyle,
    MatIconModule,
    MatRippleModule,
    MatTooltipModule,
  ],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
})
export class SidebarComponent {
  private auth = inject(AuthService);
  user$ = this.auth.user$;

  nav: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', to: '/dashboard' },
    { label: 'Carte', icon: 'map', to: '/map' },
    { label: 'Télémétrie', icon: 'show_chart', to: '/telemetry' },
    { label: 'Alertes', icon: 'notifications', to: '/alerts' },
    { label: 'Historique', icon: 'history', to: '/history' },
    { label: 'Paramètres', icon: 'settings', to: '/settings' },
  ];

  logout() {
    this.auth.logout();
  }

  initials(name?: string | null): string {
    const s = (name || '').trim();
    if (!s) return 'U';
    const parts = s.split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase()).join('');
  }

  avatarStyle(seed?: string | null) {
    const s = (seed || 'user').toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return {
      background: `linear-gradient(135deg, hsl(${hue} 85% 55%), hsl(${(hue + 30) % 360} 85% 45%))`,
    };
  }
}