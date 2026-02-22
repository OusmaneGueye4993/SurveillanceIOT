import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { filter, switchMap, tap } from 'rxjs/operators';
import { of } from 'rxjs';

import { DeviceStoreService } from './device-store.service';
import { DeviceCreateDialogComponent } from './device-create-dialog';

type AddUiOptions = {
  autoSetActiveIfNone?: boolean;
  onFirstDeviceAddedMessage?: (msg: string) => void; // optionnel
};

@Injectable({ providedIn: 'root' })
export class DeviceUiService {
  private dialog = inject(MatDialog);
  private store = inject(DeviceStoreService);

  /** Ouvre le dialog et gère l'ajout + auto-active (si demandé) */
  openAddDeviceDialog(opts?: AddUiOptions): void {
    const before = this.store.getSnapshot();
    const hadAnyBefore = before.length > 0;

    this.dialog
      .open(DeviceCreateDialogComponent, { width: '520px', maxWidth: '92vw' })
      .afterClosed()
      .pipe(
        filter(Boolean),
        switchMap((payload: any) =>
          this.store.addDevice(payload, { autoSetActiveIfNone: opts?.autoSetActiveIfNone ?? true })
        ),
        tap(() => {
          // Si c’était le premier device, on peut afficher un message (optionnel)
          if (!hadAnyBefore) {
            opts?.onFirstDeviceAddedMessage?.('Premier appareil ajouté. Pense à définir l’appareil actif.');
          }
        })
      )
      .subscribe({
        next: () => {},
        error: () => {},
      });
  }
}