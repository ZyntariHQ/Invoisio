import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const AUTH_STORAGE_KEY = "@invoisio:auth";

interface AuthState {
  accessToken: string | null;
  publicKey: string | null;
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
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (accessToken: string, publicKey: string) => {
    try {
      const authData = { accessToken, publicKey };
      await SecureStore.setItemAsync(
        AUTH_STORAGE_KEY,
        JSON.stringify(authData),
      );
      set({
        accessToken,
        publicKey,
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
      };

      if (authData.accessToken && authData.publicKey) {
        set({
          accessToken: authData.accessToken,
          publicKey: authData.publicKey,
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
