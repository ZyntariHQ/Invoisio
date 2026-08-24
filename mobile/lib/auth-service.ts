import axios from "axios";
import { API_URL } from "@env";
import { offlineQueue } from "./offline-queue";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

interface NonceResponse {
  nonce: string;
  expiresAt: number;
}

interface VerifyResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email?: string;
    publicKey?: string;
    name?: string;
  };
}

interface PendingAuthData {
  publicKey: string;
  signedNonce?: string;
  timestamp: number;
}

const AUTH_QUEUE_KEY = "@invoisio:pending_auth";
const LEGACY_AUTH_QUEUE_KEY = "@auth_queue";
const PENDING_AUTH_TTL_MS = 2 * 60 * 1000;

/**
 * Authentication service for handling SIWS (Sign-In with Stellar) flow
 * with offline support for queuing failed requests
 */
class AuthService {
  private isAuthenticating = false;

  /**
   * Request a nonce from the backend for a given Stellar public key
   * Retains the public wallet identity if offline
   */
  async requestNonce(publicKey: string): Promise<NonceResponse> {
    try {
      const response = await axios.post(`${API_URL}/auth/nonce`, {
        publicKey,
      });
      return response.data as NonceResponse;
    } catch (error) {
      // Queue if offline or network error
      if (axios.isAxiosError(error) && !error.response) {
        // A nonce request cannot complete without a fresh wallet signature.
        // Retain only the public identity so the flow can be resumed safely.
        await this.storePendingAuth(publicKey);
        throw new Error(
          "You are offline. Reconnect to restart wallet verification.",
        );
      }
      console.error("Error requesting nonce:", error);
      throw new Error("Failed to get nonce from server");
    }
  }

  /**
   * Verify the signed nonce with the backend and receive JWT
   * Retains the minimum retry payload securely if offline
   */
  async verifySignature(
    publicKey: string,
    signedNonce: string,
  ): Promise<VerifyResponse> {
    try {
      const response = await axios.post(`${API_URL}/auth/verify`, {
        publicKey,
        signedNonce,
      });
      await this.clearPendingAuth();
      return response.data as VerifyResponse;
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        // This exact payload is required to finish the interrupted login. Keep
        // it in encrypted storage and retry it once, outside the generic queue.
        await this.storePendingAuth(publicKey, signedNonce);
        throw new Error(
          "You are offline. Verification will be retried when connection is restored.",
        );
      }
      console.error("Error verifying signature:", error);
      throw new Error("Signature verification failed");
    }
  }

  /**
   * Exchange a refresh token for new credentials
   */
  async refreshSession(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const response = await axios.post(`${API_URL}/auth/refresh`, {
        refreshToken,
      });
      return response.data as { accessToken: string; refreshToken: string };
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        throw new Error("Network error during refresh.");
      }
      throw new Error("Session expired or compromised.");
    }
  }

  /**
   * Verify a stored access token against the backend.
   * A network failure resolves to "unknown" so a flaky connection does not
   * force a logout; only an explicit 401/403 means the token is rejected.
   */
  async verifyToken(
    accessToken: string,
  ): Promise<"valid" | "invalid" | "unknown"> {
    try {
      await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return "valid";
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          return "invalid";
        }
      }
      // A connectivity transition revalidates the restored token. Do not put
      // bearer credentials in the AsyncStorage-backed generic request queue.
      return "unknown";
    }
  }

  /**
   * Helper to create SIWE-style message for Stellar
   * Format: "Sign this message to authenticate with Invoisio\n\nNonce: {nonce}"
   */
  createSiweMessage(nonce: string): string {
    return `Sign this message to authenticate with Invoisio\n\nNonce: ${nonce}`;
  }

  /**
   * Decode the expiry timestamp from a JWT access token.
   * Returns the expiration time in milliseconds since epoch,
   * or null if the token cannot be decoded.
   */
  decodeTokenExpiry(token: string): number | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const segment = parts[1];
      if (!segment) return null;
      const payload = JSON.parse(
        atob(segment.replace(/-/g, "+").replace(/_/g, "/")),
      ) as { exp?: number };
      return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  async registerPushToken(accessToken: string, token: string): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/users/push-token`,
        { token },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        // Queue push token registration
        const url = `${API_URL}/users/push-token`;
        await offlineQueue.enqueue(
          url,
          "POST",
          { token },
          {
            Authorization: `Bearer ${accessToken}`,
          },
        );
      } else {
        console.error("Error registering push token:", error);
      }
    }
  }

  async unregisterPushToken(accessToken: string, token: string): Promise<void> {
    try {
      await axios.delete(`${API_URL}/users/push-token`, {
        data: { token },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        const url = `${API_URL}/users/push-token`;
        await offlineQueue.enqueue(
          url,
          "DELETE",
          { token },
          {
            Authorization: `Bearer ${accessToken}`,
          },
        );
      } else {
        console.error("Error unregistering push token:", error);
      }
    }
  }

  async updatePushPreferences(
    accessToken: string,
    enabled: boolean,
  ): Promise<void> {
    try {
      await axios.patch(
        `${API_URL}/users/preferences`,
        { pushNotificationsEnabled: enabled },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        const url = `${API_URL}/users/preferences`;
        await offlineQueue.enqueue(
          url,
          "PATCH",
          { pushNotificationsEnabled: enabled },
          {
            Authorization: `Bearer ${accessToken}`,
          },
        );
      } else {
        console.error("Error updating push preferences:", error);
      }
    }
  }

  /**
   * Retry any pending login operations
   * Returns the response and the publicKey for auth state update
   */
  async retryPendingOperation(): Promise<{
    response: VerifyResponse;
    publicKey: string;
  } | null> {
    const pending = await this.readPendingAuth();
    if (!pending) return null;

    try {
      const data = JSON.parse(pending) as PendingAuthData;

      if (
        !this.isValidPublicKey(data.publicKey) ||
        typeof data.timestamp !== "number" ||
        Date.now() - data.timestamp >= PENDING_AUTH_TTL_MS
      ) {
        await this.clearPendingAuth();
        return null;
      }

      // If we have a signedNonce, try verification
      if (data.signedNonce) {
        const result = await axios.post(`${API_URL}/auth/verify`, {
          publicKey: data.publicKey,
          signedNonce: data.signedNonce,
        });
        const response = result.data as VerifyResponse;
        await this.clearPendingAuth();
        return { response, publicKey: data.publicKey };
      }

      // If we only have publicKey (nonce request), just return it
      // The verification will be attempted separately
      console.log("Pending nonce request found. Waiting for signature...");
      return null;
    } catch (error) {
      console.error("Failed to retry pending login:", error);
      // Don't clear the queue on error - let it retry later
      return null;
    }
  }

  /**
   * Store pending auth data for later retry
   */
  async storePendingAuth(
    publicKey: string,
    signedNonce?: string,
  ): Promise<void> {
    if (!this.isValidPublicKey(publicKey)) {
      throw new Error("Cannot persist an invalid wallet public key");
    }

    await SecureStore.setItemAsync(
      AUTH_QUEUE_KEY,
      JSON.stringify({ publicKey, signedNonce, timestamp: Date.now() }),
    );
  }

  /**
   * Clear pending auth data
   */
  async clearPendingAuth(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(AUTH_QUEUE_KEY),
      AsyncStorage.removeItem(LEGACY_AUTH_QUEUE_KEY),
    ]);
  }

  /**
   * Check if there is a pending auth operation
   */
  async hasPendingAuth(): Promise<boolean> {
    const pending = await this.readPendingAuth();
    return pending !== null;
  }

  private async readPendingAuth(): Promise<string | null> {
    const securePending = await SecureStore.getItemAsync(AUTH_QUEUE_KEY);
    if (securePending) return securePending;

    // One-time migration from the previous unencrypted key.
    const legacyPending = await AsyncStorage.getItem(LEGACY_AUTH_QUEUE_KEY);
    if (!legacyPending) return null;

    try {
      const data = JSON.parse(legacyPending) as PendingAuthData;
      if (this.isValidPublicKey(data.publicKey)) {
        await SecureStore.setItemAsync(AUTH_QUEUE_KEY, legacyPending);
        await AsyncStorage.removeItem(LEGACY_AUTH_QUEUE_KEY);
        return legacyPending;
      }
    } catch {
      // Invalid legacy state is discarded below.
    }

    await AsyncStorage.removeItem(LEGACY_AUTH_QUEUE_KEY);
    return null;
  }

  private isValidPublicKey(publicKey: unknown): publicKey is string {
    return (
      typeof publicKey === "string" &&
      publicKey.startsWith("G") &&
      publicKey.length === 56
    );
  }

  isAuthenticatingLogin(): boolean {
    return this.isAuthenticating;
  }
}

// Export as singleton (backward compatible - remains an object)
export const authService = new AuthService();
