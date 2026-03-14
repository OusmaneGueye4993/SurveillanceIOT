import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

function hasSession(): boolean {
  const auth = inject(AuthService);
  return auth.isAuthenticated() || auth.hasUsableRefreshToken();
}

export const authGuard: CanActivateChildFn = () => {
  const router = inject(Router);

  if (hasSession()) return true;

  router.navigateByUrl('/login');
  return false;
};

export const publicOnlyGuard: CanActivateFn = () => {
  const router = inject(Router);

  if (!hasSession()) return true;

  router.navigateByUrl('/dashboard');
  return false;
};