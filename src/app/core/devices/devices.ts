import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { DeviceStoreService } from './device-store.service';
import { Device } from './device.model';
import { DeviceUiService } from './device-ui.service';
import { ConfirmDeleteDialogComponent } from './confirm-delete-dialog';

@Component({
  selector: 'app-devices',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatProgressBarModule,
    MatDialogModule,
  ],
  templateUrl: './devices.html',
  styleUrls: ['./devices.scss'],
})
export class DevicesComponent implements OnInit {
  displayedColumns = ['name', 'device_eui', 'status', 'actions'];

  private store = inject(DeviceStoreService);
  private ui = inject(DeviceUiService);
  private dialog = inject(MatDialog);

  devices$ = this.store.devices$;
  loading$ = this.store.loading$;
  error$ = this.store.error$;

  ngOnInit(): void {
    this.store.refresh();
  }

  refresh(): void {
    this.store.refresh();
  }

  /** ✅ Toujours dispo (liste vide ou non), réutilise le même dialog */
  openAdd(): void {
    this.ui.openAddDeviceDialog({ autoSetActiveIfNone: true });
  }

  setActive(d: Device): void {
    if (!d?.device_eui) return;
    this.store.setActive(d.device_eui);
  }

  confirmDelete(d: Device): void {
    const ref = this.dialog.open(ConfirmDeleteDialogComponent, {
      width: '480px',
      maxWidth: '92vw',
      data: {
        title: 'Supprimer cet appareil ?',
        message: `Cette action est définitive. Appareil: ${d.name || 'Sans nom'} (${d.device_eui})`,
      },
    });

    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.store.delete(d.device_eui);
    });
  }
}