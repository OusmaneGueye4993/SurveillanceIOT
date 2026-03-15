import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';

import { DeviceStoreService } from './device-store.service';
import { DeviceUiService } from './device-ui.service';
import { ConfirmDeleteDialogComponent } from './confirm-delete-dialog';

@Component({
  selector: 'app-devices',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressBarModule,
    MatCardModule,
    MatChipsModule,
  ],
  templateUrl: './devices.html',
  styleUrl: './devices.scss',
})
export class DevicesComponent {
  private store = inject(DeviceStoreService);
  private ui = inject(DeviceUiService);
  private dialog = inject(MatDialog);

  devices$ = this.store.devices$;
  loading$ = this.store.loading$;
  error$ = this.store.error$;

  hasAnyDevice$ = this.devices$.pipe(map((devices) => devices.length > 0));
  activeDevice$ = this.devices$.pipe(
    map((devices) => devices.find((d) => !!d.is_active) ?? null)
  );

  displayedColumns: string[] = ['name', 'device_eui', 'status', 'actions'];

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.store.refresh();
  }

  openAdd() {
    this.ui.openAddDeviceDialog();
  }

  setActive(d: any) {
    this.store.setActive(d.device_eui);
  }

  confirmDelete(d: any) {
    const ref = this.dialog.open(ConfirmDeleteDialogComponent, { data: d });

    ref.afterClosed().subscribe((ok) => {
      if (ok) {
        this.store.delete(d.device_eui);
      }
    });
  }

  trackByEui(_: number, d: any): string {
    return d?.device_eui ?? _;
  }
}
