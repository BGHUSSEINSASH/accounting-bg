import { User } from '../types';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const authStore = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser(): User | null {
    try {
      const user = localStorage.getItem(USER_KEY);
      return user ? JSON.parse(user) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },

  setAuth(token: string, user: User): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  hasRole(...roles: string[]): boolean {
    const user = this.getUser();
    return user ? roles.includes(user.role) : false;
  },
};
