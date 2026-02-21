import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

let refreshing = false;

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);

  // Ne pas injecter le header sur login/refresh/register
  const isAuthEndpoint =
    req.url.includes('/v1/auth/login/') ||
    req.url.includes('/v1/auth/refresh/') ||
    req.url.includes('/v1/auth/register/');

  const access = auth.getAccessToken();
  const authReq =
    !isAuthEndpoint && access
      ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);

      // Si 401 et qu'on a refresh token -> tenter refresh puis rejouer 1 fois
      if (err.status === 401 && !isAuthEndpoint && auth.getRefreshToken() && !refreshing) {
        refreshing = true;
        return auth.refreshAccess().pipe(
          switchMap(() => {
            refreshing = false;
            const newAccess = auth.getAccessToken();
            const retryReq = newAccess
              ? req.clone({ setHeaders: { Authorization: `Bearer ${newAccess}` } })
              : req;
            return next(retryReq);
          }),
          catchError((e) => {
            refreshing = false;
            auth.logout();
            return throwError(() => e);
          })
        );
      }

      return throwError(() => err);
    })
  );
};