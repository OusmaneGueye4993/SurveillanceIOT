import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateChildFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return auth.restoreSession().pipe(
    map((ok) => (ok ? true : router.createUrlTree(['/login'])))
  );
};

export const publicOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return router.createUrlTree(['/dashboard']);
  }

  if (!auth.hasUsableRefreshToken()) {
    return true;
  }

  return auth.restoreSession().pipe(
    map((ok) => (ok ? router.createUrlTree(['/dashboard']) : true))
  );
};