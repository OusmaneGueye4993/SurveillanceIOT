import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';

type Tokens = { access: string; refresh: string };
type RefreshResponse = { access: string; refresh?: string };

const ACCESS_KEY = 'auth.access';
const REFRESH_KEY = 'auth.refresh';

type JwtPayload = {
  user_id?: number;
  username?: string;
  email?: string;
  exp?: number;
  iat?: number;
  [k: string]: any;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = String(environment.apiBaseUrl || '').replace(/\/+$/, '');

  private loggedInSubject = new BehaviorSubject<boolean>(this.isAuthenticated());
  isLoggedIn$ = this.loggedInSubject.asObservable();

  private userSubject = new BehaviorSubject<JwtPayload | null>(this.getUserFromToken());
  user$ = this.userSubject.asObservable();

  private restoreInFlight$: Observable<boolean> | null = null;

  constructor(private http: HttpClient) {}

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  private normalizeEmail(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private setTokens(tokens: Tokens | RefreshResponse): void {
    if (tokens.access) {
      localStorage.setItem(ACCESS_KEY, tokens.access);
    }
    if (tokens.refresh) {
      localStorage.setItem(REFRESH_KEY, tokens.refresh);
    }
    this.refreshAuthState();
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.refreshAuthState();
  }

  private refreshAuthState(): void {
    const loggedIn = this.isAuthenticated();
    this.loggedInSubject.next(loggedIn);
    this.userSubject.next(loggedIn ? this.getUserFromToken() : null);
  }

  private decodeJwtPayload(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;

      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

      const json = atob(padded);
      return JSON.parse(json) as JwtPayload;
    } catch {
      return null;
    }
  }

  private isJwtExpired(token: string | null): boolean {
    if (!token) return true;

    const payload = this.decodeJwtPayload(token);
    const exp = Number(payload?.exp);

    if (!Number.isFinite(exp)) return true;

    const nowSec = Math.floor(Date.now() / 1000);
    return exp <= nowSec;
  }

  getUserFromToken(): JwtPayload | null {
    const token = this.getAccessToken();
    if (!token || this.isJwtExpired(token)) return null;
    return this.decodeJwtPayload(token);
  }

  refreshUserFromToken(): void {
    this.userSubject.next(this.getUserFromToken());
  }

  isAuthenticated(): boolean {
    const access = this.getAccessToken();
    return !!access && !this.isJwtExpired(access);
  }

  hasUsableRefreshToken(): boolean {
    const refresh = this.getRefreshToken();
    return !!refresh && !this.isJwtExpired(refresh);
  }

  restoreSession(): Observable<boolean> {
    if (this.isAuthenticated()) {
      return of(true);
    }

    if (!this.hasUsableRefreshToken()) {
      this.clearTokens();
      return of(false);
    }

    if (!this.restoreInFlight$) {
      this.restoreInFlight$ = this.refreshAccess().pipe(
        map(() => true),
        catchError(() => {
          this.logout();
          return of(false);
        }),
        shareReplay(1),
        finalize(() => {
          this.restoreInFlight$ = null;
        })
      );
    }

    return this.restoreInFlight$;
  }

  login(email: string, password: string): Observable<Tokens> {
    const username = this.normalizeEmail(email);

    return this.http
      .post<Tokens>(`${this.base}/v1/auth/login/`, { username, password })
      .pipe(tap((tokens) => this.setTokens(tokens)));
  }

  refreshAccess(): Observable<RefreshResponse> {
    const refresh = this.getRefreshToken();

    if (!refresh) {
      throw new Error('No refresh token');
    }

    return this.http
      .post<RefreshResponse>(`${this.base}/v1/auth/refresh/`, { refresh })
      .pipe(tap((res) => this.setTokens(res)));
  }

  logout(): void {
    this.clearTokens();
  }

  register(email: string, password: string): Observable<{ id: number; username: string; email: string }> {
    const cleanEmail = this.normalizeEmail(email);

    return this.http.post<{ id: number; username: string; email: string }>(
      `${this.base}/v1/auth/register/`,
      {
        username: cleanEmail,
        email: cleanEmail,
        password,
      }
    );
  }

  registerAndLogin(email: string, password: string): Observable<Tokens> {
    return this.register(email, password).pipe(switchMap(() => this.login(email, password)));
  }

  getDisplayName(snapshot?: JwtPayload | null): string {
    const u = snapshot ?? this.userSubject.value;
    return (u?.email || u?.username || 'Utilisateur').toString();
  }
}