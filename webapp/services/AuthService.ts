/**
 * AuthService
 *
 * Handles all auth network operations: login, token refresh, and logout.
 * This is intentionally thin — it only makes the HTTP calls and maps
 * responses to typed objects. Session persistence is the SessionManager's job.
 */

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://api.yourapp.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (e.g. 900 = 15 min) */
  expiresIn: number;
  /** Seconds until the refresh token expires (e.g. 2592000 = 30 days) */
  refreshExpiresIn: number;
}

export interface MerchantProfile {
  merchantId: string;
  email: string;
  displayName: string;
}

export interface LoginResult {
  tokens: AuthTokens;
  merchant: MerchantProfile;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Returns true if the access token has expired or expires within the
 * next `bufferSeconds` seconds (default 60 s — refresh before it actually
 * expires to avoid race conditions with in-flight requests).
 */
export function isAccessTokenExpired(
  expiresAt: number,
  bufferSeconds = 60
): boolean {
  return nowSec() + bufferSeconds >= expiresAt;
}

/**
 * Returns true if the refresh token itself has expired. When this is true
 * the merchant must log in again.
 */
export function isRefreshTokenExpired(expiresAt: number): boolean {
  return nowSec() >= expiresAt;
}

/**
 * Convert a "expires in N seconds" value from the server into an absolute
 * Unix timestamp so we can compare it against Date.now() at any future point.
 */
export function toAbsoluteExpiry(expiresInSeconds: number): number {
  return nowSec() + expiresInSeconds;
}

// ─── Network calls ────────────────────────────────────────────────────────────

export async function loginWithCredentials(
  credentials: LoginCredentials
): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/auth/merchant/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Login failed (${res.status})`);
  }

  return res.json() as Promise<LoginResult>;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(`${API_BASE}/auth/merchant/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    // 401 / 403 means the refresh token itself is invalid or revoked
    throw new Error(`Token refresh failed (${res.status})`);
  }

  return res.json();
}

export async function revokeSession(accessToken: string): Promise<void> {
  // Best-effort — don't let a network failure block the local logout
  await fetch(`${API_BASE}/auth/merchant/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => {
    // swallow — we clear local state regardless
  });
}