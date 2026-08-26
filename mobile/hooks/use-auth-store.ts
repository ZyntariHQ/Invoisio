import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { authService } from "../lib/auth-service";

const AUTH_STORAGE_KEY = "@invoisio:auth";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  publicKey: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setAuth: (accessToken: string, refreshToken: string, publicKey: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  publicKey: null,
  expiresAt: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (accessToken: string, refreshToken: string, publicKey: string) => {
    try {
      const expiresAt = authService.decodeTokenExpiry(accessToken);
      if (
        expiresAt == null ||
        !publicKey.startsWith("G") ||
        publicKey.length !== 56
      ) {
        throw new Error("Cannot persist invalid authentication data");
      }
      const authData = { accessToken, refreshToken, publicKey, expiresAt };
      await SecureStore.setItemAsync(
        AUTH_STORAGE_KEY,
        JSON.stringify(authData),
      );
      set({
        accessToken,
        refreshToken,
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
        refreshToken: null,
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
        refreshToken?: string;
        publicKey?: string;
        expiresAt?: number | null;
      };

      const storedAccessToken = authData.accessToken;
      const storedRefreshToken = authData.refreshToken;
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

        // If it's expired locally but we have a refresh token, we shouldn't wipe it
        // yet, because the interceptor can refresh it.
        if (!storedRefreshToken && (expiresAt == null || Date.now() >= expiresAt)) {
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          set({
            accessToken: null,
            refreshToken: null,
            publicKey: null,
            expiresAt: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return false;
        }

        // Confirm with the backend. If expired, the interceptor will refresh it here.
        // A network failure ("unknown") keeps the restored session.
        const status = await authService.verifyToken(storedAccessToken);

        if (status === "invalid") {
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          set({
            accessToken: null,
            refreshToken: null,
            publicKey: null,
            expiresAt: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return false;
        }

        // We use getState to capture potentially refreshed tokens from the interceptor
        // which might have executed during `verifyToken()`.
        const currentState = useAuthStore.getState();
        const finalAccessToken = currentState.accessToken ?? storedAccessToken;
        const finalRefreshToken = currentState.refreshToken ?? storedRefreshToken;
        const finalExpiresAt = currentState.accessToken 
          ? authService.decodeTokenExpiry(currentState.accessToken) 
          : expiresAt;

        set({
          accessToken: finalAccessToken,
          refreshToken: finalRefreshToken,
          publicKey: storedPublicKey,
          expiresAt: finalExpiresAt,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }

      await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
      set({
        accessToken: null,
        refreshToken: null,
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
        refreshToken: null,
        publicKey: null,
        expiresAt: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return false;
    }
  },
}));
