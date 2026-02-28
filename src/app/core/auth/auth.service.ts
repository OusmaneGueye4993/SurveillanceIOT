import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, switchMap, tap } from 'rxjs';

type Tokens = { access: string; refresh: string };

// ✅ Tes clés actuelles
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
  // ✅ retire les "/" à la fin pour éviter /api//v1/...
  private base = String(environment.apiBaseUrl || '').replace(/\/+$/, '');

  // ✅ Auth state
  private loggedInSubject = new BehaviorSubject<boolean>(this.hasAccessToken());
  isLoggedIn$ = this.loggedInSubject.asObservable();

  // ✅ User state
  private userSubject = new BehaviorSubject<JwtPayload | null>(this.getUserFromToken());
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {}

  private hasAccessToken(): boolean {
    return !!localStorage.getItem(ACCESS_KEY);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  private setTokens(tokens: Tokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.access);
    localStorage.setItem(REFRESH_KEY, tokens.refresh);
    this.loggedInSubject.next(true);
    this.refreshUserFromToken();
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.loggedInSubject.next(false);
    this.userSubject.next(null);
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

  private getUserFromToken(): JwtPayload | null {
    const token = this.getAccessToken();
    if (!token) return null;
    return this.decodeJwtPayload(token);
  }

  refreshUserFromToken(): void {
    this.userSubject.next(this.getUserFromToken());
  }

  /** ✅ LOGIN: backend attend username/password, donc username=email */
  login(email: string, password: string): Observable<Tokens> {
    const username = String(email || '').trim().toLowerCase();
    return this.http
      .post<Tokens>(`${this.base}/v1/auth/login/`, { username, password })
      .pipe(tap((t) => this.setTokens(t)));
  }

  /** ✅ REFRESH access token */
  refreshAccess(): Observable<{ access: string }> {
    const refresh = this.getRefreshToken();
    if (!refresh) throw new Error('No refresh token');

    return this.http.post<{ access: string }>(`${this.base}/v1/auth/refresh/`, { refresh }).pipe(
      tap((res) => {
        localStorage.setItem(ACCESS_KEY, res.access);
        this.loggedInSubject.next(true);
        this.refreshUserFromToken();
      })
    );
  }

  logout(): void {
    this.clearTokens();
  }

  /** ✅ REGISTER: username=email */
  register(email: string, password: string): Observable<{ id: number; username: string }> {
    const cleanEmail = String(email || '').trim().toLowerCase();
    return this.http.post<{ id: number; username: string }>(`${this.base}/v1/auth/register/`, {
      username: cleanEmail,
      email: cleanEmail,
      password,
    });
  }

  registerAndLogin(email: string, password: string): Observable<Tokens> {
    return this.register(email, password).pipe(switchMap(() => this.login(email, password)));
  }

  getDisplayName(snapshot?: JwtPayload | null): string {
    const u = snapshot ?? this.userSubject.value;
    return (u?.email || u?.username || 'Utilisateur').toString();
  }
}