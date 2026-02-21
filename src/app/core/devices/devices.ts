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

// ✅ IMPORTANT: vérifie bien ce chemin et ce nom
import { DeviceStoreService } from './device-store.service';
import { Device } from './device.model';

import { DeviceCreateDialogComponent } from './device-create-dialog';
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

  // ✅ inject() évite TS2729 et NG2003 si import correct
  private store = inject(DeviceStoreService);
  private dialog = inject(MatDialog);

  // ✅ maintenant store est initialisé
  devices$ = this.store.devices$;
  loading$ = this.store.loading$;
  error$ = this.store.error$;

  ngOnInit(): void {
    this.store.refresh();
  }

  refresh(): void {
    this.store.refresh();
  }

  openAdd(): void {
    const ref = this.dialog.open(DeviceCreateDialogComponent, {
      width: '520px',
      maxWidth: '92vw',
    });

    ref.afterClosed().subscribe((payload) => {
      if (!payload) return;
      this.store.add(payload);
    });
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