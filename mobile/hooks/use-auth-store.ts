import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { AuthService } from "../lib/auth-service";

const AUTH_STORAGE_KEY = "@invoisio:auth";

interface AuthState {
  accessToken: string | null;
  publicKey: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setAuth: (accessToken: string, publicKey: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  publicKey: null,
  expiresAt: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (accessToken: string, publicKey: string) => {
    try {
      const expiresAt = AuthService.decodeTokenExpiry(accessToken);
      const authData = { accessToken, publicKey, expiresAt };
      await SecureStore.setItemAsync(
        AUTH_STORAGE_KEY,
        JSON.stringify(authData),
      );
      set({
        accessToken,
        publicKey,
        expiresAt,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error storing auth data:", error);
      throw error;
    }
  },

  clearAuth: async () => {
    try {
      await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
      set({
        accessToken: null,
        publicKey: null,
        expiresAt: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error clearing auth data:", error);
      throw error;
    }
  },

  loadAuth: async () => {
    try {
      const authDataString = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);

      if (!authDataString) {
        set({ isLoading: false });
        return false;
      }

      const authData = JSON.parse(authDataString) as {
        accessToken?: string;
        publicKey?: string;
        expiresAt?: number | null;
      };

      if (authData.accessToken && authData.publicKey) {
        const expiresAt =
          typeof authData.expiresAt === "number" ? authData.expiresAt : null;

        // Local expiry check first — works offline and avoids a wasted request.
        if (expiresAt != null && Date.now() >= expiresAt) {
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          set({ isLoading: false });
          return false;
        }

        // Confirm with the backend. A network failure ("unknown") keeps the
        // restored session so transient connectivity issues do not log the
        // merchant out; only an explicit rejection clears credentials.
        const status = await AuthService.verifyToken(authData.accessToken);

        if (status === "invalid") {
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          set({ isLoading: false });
          return false;
        }

        set({
          accessToken: authData.accessToken,
          publicKey: authData.publicKey,
          expiresAt,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }

      set({ isLoading: false });
      return false;
    } catch (error) {
      console.error("Error loading auth data:", error);
      set({ isLoading: false });
      return false;
    }
  },
}));
