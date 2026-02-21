import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class TopbarComponent {
  constructor(public auth: AuthService) {}

  logout(): void {
    this.auth.logout();
  }
}