import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

type Tokens = { access: string; refresh?: string };

const ACCESS_KEY = 'auth.access';
const REFRESH_KEY = 'auth.refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = environment.apiBaseUrl; // ex: http://127.0.0.1:8000 (sans / à la fin)

  private loggedInSubject = new BehaviorSubject<boolean>(this.hasAccessToken());
  isLoggedIn$ = this.loggedInSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

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
    if (tokens.refresh) localStorage.setItem(REFRESH_KEY, tokens.refresh);
    this.loggedInSubject.next(true);
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.loggedInSubject.next(false);
  }

  // ✅ Ton backend: TokenObtainPairView attend username/password
  login(email: string, password: string): Observable<Tokens> {
    const username = String(email || '').trim().toLowerCase(); // username == email
    return this.http
      .post<Tokens>(`${this.base}/v1/auth/login/`, { username, password })
      .pipe(tap((t) => this.setTokens(t)));
  }

  // ✅ Ton backend: TokenRefreshView attend refresh
  refreshAccess(): Observable<{ access: string }> {
    const refresh = this.getRefreshToken();
    if (!refresh) throw new Error('No refresh token');

    return this.http
      .post<{ access: string }>(`${this.base}/v1/auth/refresh/`, { refresh })
      .pipe(
        tap((res) => {
          localStorage.setItem(ACCESS_KEY, res.access);
          this.loggedInSubject.next(true);
        })
      );
  }

  // ✅ Ton backend: RegisterSerializer attend username/email/password
  register(email: string, password: string) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    return this.http.post<{ id: number; username: string }>(
      `${this.base}/v1/auth/register/`,
      {
        username: cleanEmail, // IMPORTANT: username = email
        email: cleanEmail,
        password,
      }
    );
  }

  // Option pro: register puis login direct
  registerAndLogin(email: string, password: string) {
    return this.register(email, password).pipe(switchMap(() => this.login(email, password)));
  }

  logout(): void {
    this.clearTokens();
    this.router.navigateByUrl('/login');
  }
}