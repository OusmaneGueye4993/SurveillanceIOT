import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

function isLoggedIn(): boolean {
  const auth = inject(AuthService);
  return !!auth.getAccessToken();
}

// Protège les routes privées (Shell)
export const authGuard: CanActivateChildFn = () => {
  const router = inject(Router);
  if (isLoggedIn()) return true;

  router.navigateByUrl('/login');
  return false;
};

// Empêche d’accéder à /login et /register quand on est déjà connecté
export const publicOnlyGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!isLoggedIn()) return true;

  router.navigateByUrl('/dashboard');
  return false;
};