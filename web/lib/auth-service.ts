import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

export interface NonceResponse {
  nonce: string;
  expiresAt: number;
}

export interface VerifyResponse {
  accessToken: string;
}

export interface MeResponse {
  id: string;
  publicKey: string;
  createdAt: string;
}

export const AuthService = {
  async requestChallenge(publicKey: string): Promise<NonceResponse> {
    try {
      const response = await apiClient.post<NonceResponse>('/auth/nonce', {
        publicKey,
      });
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  async verifySignature(
    publicKey: string,
    signedNonce: string,
  ): Promise<VerifyResponse> {
    try {
      const response = await apiClient.post<VerifyResponse>('/auth/verify', {
        publicKey,
        signedNonce,
      });
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  async getMe(): Promise<MeResponse> {
    try {
      const response = await apiClient.get<MeResponse>('/auth/me');
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },
};
