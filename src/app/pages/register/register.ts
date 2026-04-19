import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { passwordMatchValidator, strongPasswordValidator } from '../../core/auth/password.validator';

type ToastType = 'success' | 'error' | 'info';

@Component({
  selector: 'app-register',
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
  templateUrl: './register.html',
  styleUrls: ['./register.scss'],
})
export class RegisterComponent implements OnDestroy {
  loading = false;
  hide = true;
  hideConfirm = true;

  form: FormGroup;

  toastVisible = false;
  toastMessage = '';
  toastType: ToastType = 'info';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group(
      {
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8), strongPasswordValidator]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: [passwordMatchValidator('password', 'confirmPassword')],
      }
    );
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
      e?.error?.password?.[0] ||
      e?.error?.email?.[0] ||
      'Création de compte impossible.'
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

      if (this.form.get('password')?.hasError('minlength')) {
        this.showToast('Le mot de passe doit contenir au moins 8 caractères.', 'error');
        return;
      }

      if (this.form.get('password')?.hasError('strongPassword')) {
        this.showToast('Le mot de passe doit contenir une majuscule, une minuscule et un chiffre.', 'error');
        return;
      }

      if (this.form.get('confirmPassword')?.hasError('required')) {
        this.showToast('Confirmation du mot de passe obligatoire.', 'error');
        return;
      }

      if (this.form.hasError('passwordMismatch')) {
        this.showToast('Les mots de passe ne correspondent pas.', 'error');
        return;
      }

      this.showToast('Formulaire invalide.', 'error');
      return;
    }

    const { email, password } = this.form.value as {
      email: string;
      password: string;
      confirmPassword: string;
    };

    this.loading = true;

    this.auth.registerAndLogin(email, password).subscribe({
      next: () => {
        this.loading = false;
        this.showToast('Compte créé avec succès.', 'success');
        setTimeout(() => {
          this.router.navigateByUrl('/devices');
        }, 700);
      },
      error: (e) => {
        this.loading = false;
        this.showToast(this.extractErrorMessage(e), 'error');
      },
    });
  }
}