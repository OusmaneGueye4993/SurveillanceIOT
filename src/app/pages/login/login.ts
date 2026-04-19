import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { catchError, finalize, of, switchMap } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { DeviceService } from '../../core/devices/device.service';

type ToastType = 'success' | 'error' | 'info';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent implements OnDestroy {
  loading = false;
  hide = true;

  form: FormGroup;

  toastVisible = false;
  toastMessage = '';
  toastType: ToastType = 'info';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private devicesApi: DeviceService,
    private router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  ngOnDestroy(): void {
    this.clearToastTimer();
  }

  private clearToastTimer(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  private showToast(message: string, type: ToastType = 'info'): void {
    this.clearToastTimer();
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;

    this.toastTimer = setTimeout(() => {
      this.toastVisible = false;
      this.toastMessage = '';
    }, 5000);
  }

  closeToast(): void {
    this.clearToastTimer();
    this.toastVisible = false;
    this.toastMessage = '';
  }

  private extractErrorMessage(e: any): string {
    return (
      e?.error?.detail ||
      e?.error?.username?.[0] ||
      e?.error?.email?.[0] ||
      'Connexion impossible. Vérifie ton email et ton mot de passe.'
    );
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      if (this.form.get('email')?.hasError('required')) {
        this.showToast('Email obligatoire.', 'error');
        return;
      }

      if (this.form.get('email')?.hasError('email')) {
        this.showToast('Format email invalide.', 'error');
        return;
      }

      if (this.form.get('password')?.hasError('required')) {
        this.showToast('Mot de passe obligatoire.', 'error');
        return;
      }

      this.showToast('Formulaire invalide.', 'error');
      return;
    }

    const { email, password } = this.form.value as { email: string; password: string };

    this.loading = true;

    this.auth
      .login(email, password)
      .pipe(
        switchMap(() =>
          this.devicesApi.listMyDevices().pipe(
            catchError(() => of(null))
          )
        ),
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (devices) => {
          this.showToast('Connexion réussie.', 'success');

          if (devices === null) {
            setTimeout(() => this.router.navigateByUrl('/dashboard'), 600);
            return;
          }

          const list = devices || [];
          const hasAny = list.length > 0;
          const hasActive = list.some((d) => !!d.is_active);

          if (!hasAny || !hasActive) {
            setTimeout(() => this.router.navigateByUrl('/devices'), 600);
            return;
          }

          setTimeout(() => this.router.navigateByUrl('/dashboard'), 600);
        },
        error: (e) => {
          this.showToast(this.extractErrorMessage(e), 'error');
        },
      });
  }
}