import axios from "axios";
import { API_URL } from "@env";

/**
 * Merchant profile returned from the backend.
 */
export interface MerchantProfile {
  id: string;
  name: string;
  stellarPublicKey: string;
  payoutPublicKey: string | null;
  preferredAsset: string;
  webhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for updating merchant settings.
 * All fields are optional – only supplied fields are updated.
 */
export interface UpdateMerchantSettingsPayload {
  name?: string;
  payoutPublicKey?: string;
  preferredAsset?: string;
  webhookUrl?: string;
}

/**
 * Stellar G-address validation (56 chars, starts with G, base-32).
 */
const STELLAR_G_RE = /^G[A-Z2-7]{55}$/;

export function isValidStellarPublicKey(key: string): boolean {
  return STELLAR_G_RE.test(key);
}

/**
 * MerchantService – API methods for merchant profile and settings.
 */
export const MerchantService = {
  /**
   * Fetch the authenticated merchant's profile.
   */
  async getProfile(accessToken: string): Promise<MerchantProfile> {
    const response = await axios.get<MerchantProfile>(
      `${API_URL}/merchants/profile`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return response.data;
  },

  /**
   * Update merchant settings.
   * Validates the payoutPublicKey client-side before sending.
   */
  async updateSettings(
    accessToken: string,
    payload: UpdateMerchantSettingsPayload,
  ): Promise<MerchantProfile> {
    // Client-side Stellar key validation
    if (
      payload.payoutPublicKey !== undefined &&
      payload.payoutPublicKey !== "" &&
      !isValidStellarPublicKey(payload.payoutPublicKey)
    ) {
      throw new Error(
        "Invalid payout public key. Must be a Stellar G-address (56 characters, starts with G).",
      );
    }

    const response = await axios.patch<MerchantProfile>(
      `${API_URL}/merchants/settings`,
      payload,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return response.data;
  },
};
