import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/axios'; 
import { User } from '@/types/user';

interface AuthState {
  user: User | null;
  csrfToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  fetchCsrfToken: () => Promise<void>;
  connectWallet: () => Promise<string | null>;
  login: (walletAddress: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      csrfToken: null,
      isAuthenticated: false,
      loading: false,

      async fetchCsrfToken() {
        try {
          const res = await api.get('/api/auth/wallet/csrf-token');
          const token = res.data.data.csrfToken;
          set({ csrfToken: token });
          api.defaults.headers.common['X-CSRF-Token'] = token;
        } catch (err) {
          // handle error silently
        }
      },

      async connectWallet() {
        if (!(window as any).ethereum) return null;
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        return accounts[0];
      },

      async login(walletAddress: string) {
        set({ loading: true });
        try {
          const res = await api.post('/api/auth/wallet/login', { walletAddress });
          set({
            user: res.data.data.user,
            isAuthenticated: true,
            loading: false,
          });
        } catch {
          set({ loading: false, isAuthenticated: false });
        }
      },

      async refresh() {
        try {
          await api.post('/api/auth/wallet/refresh');
        } catch {
          set({ isAuthenticated: false });
        }
      },

      async logout() {
        try {
          await api.post('/api/auth/wallet/logout');
        } finally {
          set({ user: null, isAuthenticated: false });
        }
      },

      async checkAuth() {
        set({ loading: true });
        try {
          const res = await api.get('/api/auth/wallet/me');
          set({ user: res.data.data.user, isAuthenticated: true, loading: false });
        } catch {
          set({ user: null, isAuthenticated: false, loading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        csrfToken: state.csrfToken,
      }),
    },
  ),
);
