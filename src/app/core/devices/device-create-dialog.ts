import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-device-create-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './device-create-dialog.html',
  styleUrls: ['./device-create-dialog.scss'],
})
export class DeviceCreateDialogComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private ref: MatDialogRef<DeviceCreateDialogComponent>
  ) {
    // ✅ init ici (fb déjà injecté)
    this.form = this.fb.group({
      name: [''],
      device_eui: ['', [Validators.required, Validators.pattern(/^[0-9A-Fa-f]{16}$/)]],
      description: [''],
    });
  }

  close(): void {
    this.ref.close(null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value as any;
    this.ref.close({
      name: (v.name || '').trim(),
      device_eui: String(v.device_eui || '').trim().toUpperCase(),
      description: (v.description || '').trim(),
    });
  }
}