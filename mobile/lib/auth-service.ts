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
   * Helper to create SIWE-style message for Stellar
   * Format: "Sign this message to authenticate with Invoisio\n\nNonce: {nonce}"
   */
  createSiweMessage(nonce: string): string {
    return `Sign this message to authenticate with Invoisio\n\nNonce: ${nonce}`;
  },
};
