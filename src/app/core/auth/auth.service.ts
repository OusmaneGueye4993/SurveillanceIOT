import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, tap, switchMap } from 'rxjs';

type Tokens = { access: string; refresh: string };

const ACCESS_KEY = 'auth.access';
const REFRESH_KEY = 'auth.refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // ✅ retire les "/" à la fin pour éviter /api//v1/...
  private base = String(environment.apiBaseUrl || '').replace(/\/+$/, '');

  private loggedInSubject = new BehaviorSubject<boolean>(this.hasAccessToken());
  isLoggedIn$ = this.loggedInSubject.asObservable();

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
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.loggedInSubject.next(false);
  }

  // ✅ LOGIN = email + password (backend attend username/password, donc username=email)
  login(email: string, password: string): Observable<Tokens> {
    const username = String(email || '').trim().toLowerCase();
    return this.http
      .post<Tokens>(`${this.base}/v1/auth/login/`, { username, password })
      .pipe(tap((t) => this.setTokens(t)));
  }

  refreshAccess(): Observable<{ access: string }> {
    const refresh = this.getRefreshToken();
    if (!refresh) throw new Error('No refresh token');

    return this.http.post<{ access: string }>(`${this.base}/v1/auth/refresh/`, { refresh }).pipe(
      tap((res) => {
        localStorage.setItem(ACCESS_KEY, res.access);
        this.loggedInSubject.next(true);
      })
    );
  }

  logout(): void {
    this.clearTokens();
  }

  // ✅ REGISTER = email + password (on met username=email)
  register(email: string, password: string) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    return this.http.post<{ id: number; username: string }>(`${this.base}/v1/auth/register/`, {
      username: cleanEmail,
      email: cleanEmail,
      password,
    });
  }

  registerAndLogin(email: string, password: string) {
    return this.register(email, password).pipe(switchMap(() => this.login(email, password)));
  }
}