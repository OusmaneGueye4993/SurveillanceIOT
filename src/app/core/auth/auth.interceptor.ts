import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, map, shareReplay, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

let refreshInFlight$: Observable<string> | null = null;

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/v1/auth/login') ||
    url.includes('/v1/auth/register') ||
    url.includes('/v1/auth/refresh')
  );
}

function addBearer(req: HttpRequest<any>, access: string | null): HttpRequest<any> {
  if (!access) return req;
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${access}`,
    },
  });
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const auth = inject(AuthService);
  const skip = isAuthEndpoint(req.url);

  const initialReq = !skip ? addBearer(req, auth.getAccessToken()) : req;

  return next(initialReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }

      if (skip || err.status !== 401 || !auth.hasUsableRefreshToken()) {
        return throwError(() => err);
      }

      if (!refreshInFlight$) {
        refreshInFlight$ = auth.refreshAccess().pipe(
          map((res) => res.access),
          shareReplay(1),
          finalize(() => {
            refreshInFlight$ = null;
          })
        );
      }

      return refreshInFlight$.pipe(
        switchMap((newAccess) => {
          const retryReq = addBearer(req, newAccess);
          return next(retryReq);
        }),
        catchError((refreshErr) => {
          auth.logout();
          return throwError(() => refreshErr);
        })
      );
    })
  );
};