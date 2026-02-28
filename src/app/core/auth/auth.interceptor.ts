import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

let refreshing = false;

function isAuthEndpoint(url: string): boolean {
  // On ignore les endpoints auth
  return (
    url.includes('/v1/auth/login') ||
    url.includes('/v1/auth/register') ||
    url.includes('/v1/auth/refresh')
  );
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const auth = inject(AuthService);

  const skip = isAuthEndpoint(req.url);

  // ✅ Inject Authorization header
  const access = auth.getAccessToken();
  const authReq =
    !skip && access
      ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }

      // ✅ 401 -> refresh une fois puis rejouer la requête
      if (err.status === 401 && !skip && auth.getRefreshToken() && !refreshing) {
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