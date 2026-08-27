import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { authService } from "../lib/auth-service";

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
      const expiresAt = authService.decodeTokenExpiry(accessToken);
      if (
        expiresAt == null ||
        !publicKey.startsWith("G") ||
        publicKey.length !== 56
      ) {
        throw new Error("Cannot persist invalid authentication data");
      }
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

      const storedAccessToken = authData.accessToken;
      const storedPublicKey = authData.publicKey;
      const hasValidIdentity =
        typeof storedAccessToken === "string" &&
        storedAccessToken.length > 0 &&
        typeof storedPublicKey === "string" &&
        storedPublicKey.startsWith("G") &&
        storedPublicKey.length === 56;

      if (hasValidIdentity) {
        const expiresAt =
          typeof authData.expiresAt === "number"
            ? authData.expiresAt
            : authService.decodeTokenExpiry(storedAccessToken);

        // Local expiry check first — works offline and avoids a wasted request.
        if (expiresAt == null || Date.now() >= expiresAt) {
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          set({
            accessToken: null,
            publicKey: null,
            expiresAt: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return false;
        }

        // Confirm with the backend. A network failure ("unknown") keeps the
        // restored session so transient connectivity issues do not log the
        // merchant out; only an explicit rejection clears credentials.
        const status = await authService.verifyToken(storedAccessToken);

        if (status === "invalid") {
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          set({
            accessToken: null,
            publicKey: null,
            expiresAt: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return false;
        }

        set({
          accessToken: storedAccessToken,
          publicKey: storedPublicKey,
          expiresAt,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }

      await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
      set({
        accessToken: null,
        publicKey: null,
        expiresAt: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return false;
    } catch (error) {
      console.error("Error loading auth data:", error);
      try {
        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
      } catch {
        // Preserve the original load failure while resetting memory safely.
      }
      set({
        accessToken: null,
        publicKey: null,
        expiresAt: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return false;
    }
  },
}));
