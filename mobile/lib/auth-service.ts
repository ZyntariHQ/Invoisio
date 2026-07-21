import axios from "axios";
import { API_URL } from "@env";
import { offlineQueue } from "./offline-queue";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface NonceResponse {
  nonce: string;
  expiresAt: number;
}

interface VerifyResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email?: string;
    publicKey?: string;
    name?: string;
  };
}

const AUTH_QUEUE_KEY = "@auth_queue";

/**
 * Authentication service for handling SIWS (Sign-In with Stellar) flow
 * with offline support for queuing failed requests
 */
class AuthService {
  private isAuthenticating = false;

  /**
   * Request a nonce from the backend for a given Stellar public key
   * Queues the request if offline
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
        const url = `${API_URL}/auth/nonce`;
        await offlineQueue.enqueue(url, "POST", { publicKey });
        throw new Error("You are offline. Nonce request will be retried when connection is restored.");
      }
      console.error("Error requesting nonce:", error);
      throw new Error("Failed to get nonce from server");
    }
  }

  /**
   * Verify the signed nonce with the backend and receive JWT
   * Queues the request if offline
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
      return response.data as VerifyResponse;
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        // Queue the verification for retry
        const url = `${API_URL}/auth/verify`;
        await offlineQueue.enqueue(url, "POST", { publicKey, signedNonce });
        throw new Error("You are offline. Verification will be retried when connection is restored.");
      }
      console.error("Error verifying signature:", error);
      throw new Error("Signature verification failed");
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
      // Network error - queue verification for later
      if (axios.isAxiosError(error) && !error.response) {
        const url = `${API_URL}/auth/me`;
        await offlineQueue.enqueue(url, "GET", undefined, {
          Authorization: `Bearer ${accessToken}`,
        });
      }
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
        await offlineQueue.enqueue(url, "POST", { token }, {
          Authorization: `Bearer ${accessToken}`,
        });
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
        await offlineQueue.enqueue(url, "DELETE", { token }, {
          Authorization: `Bearer ${accessToken}`,
        });
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
        await offlineQueue.enqueue(url, "PATCH", { pushNotificationsEnabled: enabled }, {
          Authorization: `Bearer ${accessToken}`,
        });
      } else {
        console.error("Error updating push preferences:", error);
      }
    }
  }

  /**
   * Retry any pending login operations
   */
  async retryPendingOperation(): Promise<VerifyResponse | null> {
    const pending = await AsyncStorage.getItem(AUTH_QUEUE_KEY);
    if (!pending) return null;

    try {
      const { publicKey, signedNonce } = JSON.parse(pending);
      const response = await this.verifySignature(publicKey, signedNonce);
      await AsyncStorage.removeItem(AUTH_QUEUE_KEY);
      return response;
    } catch (error) {
      console.error("Failed to retry pending login:", error);
      return null;
    }
  }

  isAuthenticatingLogin(): boolean {
    return this.isAuthenticating;
  }
}

// Export as singleton (backward compatible - remains an object)
export const AuthService = new AuthService();