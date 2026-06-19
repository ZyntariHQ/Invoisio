import axios from "axios";
import { API_URL } from "@env";

interface NonceResponse {
  nonce: string;
  expiresAt: number;
}

interface VerifyResponse {
  accessToken: string;
}

/**
 * Authentication service for handling SIWS (Sign-In with Stellar) flow
 */
export const AuthService = {
  /**
   * Request a nonce from the backend for a given Stellar public key
   */
  async requestNonce(publicKey: string): Promise<NonceResponse> {
    try {
      const response = await axios.post(`${API_URL}/auth/nonce`, {
        publicKey,
      });
      return response.data as NonceResponse;
    } catch (error) {
      console.error("Error requesting nonce:", error);
      throw new Error("Failed to get nonce from server");
    }
  },

  /**
   * Verify the signed nonce with the backend and receive JWT
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
      console.error("Error verifying signature:", error);
      throw new Error("Signature verification failed");
    }
  },

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
      return "unknown";
    }
  },

  /**
   * Helper to create SIWE-style message for Stellar
   * Format: "Sign this message to authenticate with Invoisio\n\nNonce: {nonce}"
   */
  createSiweMessage(nonce: string): string {
    return `Sign this message to authenticate with Invoisio\n\nNonce: ${nonce}`;
  },

  /**
   * Decode a JWT's `exp` claim into epoch milliseconds without verifying the
   * signature. Used only to store session metadata so expiry can be checked
   * locally (e.g. offline) on app boot. Returns null if the token has no
   * readable numeric `exp`.
   */
  decodeTokenExpiry(accessToken: string): number | null {
    try {
      const payload = accessToken.split(".")[1];
      if (!payload) {
        return null;
      }
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const json = Buffer.from(normalized, "base64").toString("utf-8");
      const claims = JSON.parse(json) as { exp?: unknown };
      if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) {
        return claims.exp * 1000;
      }
      return null;
    } catch {
      return null;
    }
  },
};
