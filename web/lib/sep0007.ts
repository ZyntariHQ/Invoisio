/**
 * SEP-0007: Application-Initiated Payment Requests
 * Generates payment URIs for Stellar wallets
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0005.md
 */

export interface PaymentParams {
  destination: string; // Recipient's Stellar public key
  amount?: string; // Amount in stroops or as a decimal string
  assetCode?: string; // Asset code (e.g., 'USDC')
  assetIssuer?: string; // Asset issuer's public key (required if assetCode is not native)
  memo?: string; // Memo string
  memoType?: 'text' | 'id' | 'hash' | 'return'; // Type of memo
  callback?: string; // URL for wallet to POST callback after signing
}

/**
 * Generates a SEP-0007 payment URI
 * @param params Payment parameters
 * @returns SEP-0007 compliant URI
 */
export function generatePaymentUri(params: PaymentParams): string {
  const {
    destination,
    amount,
    assetCode,
    assetIssuer,
    memo,
    memoType = 'id',
    callback,
  } = params;

  const queryParts: string[] = [];

  // Required
  queryParts.push(`destination=${encodeURIComponent(destination)}`);

  // Optional parameters
  if (amount) {
    queryParts.push(`amount=${encodeURIComponent(amount)}`);
  }

  if (assetCode) {
    queryParts.push(`asset_code=${encodeURIComponent(assetCode)}`);
  }

  if (assetIssuer) {
    queryParts.push(`asset_issuer=${encodeURIComponent(assetIssuer)}`);
  }

  if (memo) {
    queryParts.push(`memo=${encodeURIComponent(memo)}`);
    queryParts.push(`memo_type=${memoType}`);
  }

  if (callback) {
    queryParts.push(`callback=${encodeURIComponent(callback)}`);
  }

  return `web+stellar:pay?${queryParts.join('&')}`;
}

/**
 * Detects if Freighter wallet extension is available (desktop)
 */
export function isFreighterAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).freighter;
}

/**
 * Opens a payment URI in the appropriate wallet
 * Desktop: web+stellar: protocol handler or Freighter
 */
export async function openPaymentWallet(uri: string): Promise<void> {
  // Desktop only - react-native import is never executed in web builds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const freighter = typeof window !== 'undefined' ? (window as any).freighter : null;
  if (freighter?.openPaymentUrl) {
    try {
      await freighter.openPaymentUrl(uri);
    } catch {
      // Fallback to protocol handler
      window.location.href = uri;
    }
  } else {
    // Use the web+stellar: protocol handler
    window.location.href = uri;
  }
}

/**
 * Gets wallet availability info for UI display
 */
export function getWalletInfo(): {
  hasWallet: boolean;
  isMobile: boolean;
  isFreighter: boolean;
  message: string;
} {
  const isFreighter = isFreighterAvailable();

  return {
    hasWallet: isFreighter,
    isMobile: false,
    isFreighter,
    message: isFreighter
      ? 'Payment will open in Freighter'
      : 'Install a Stellar wallet (Freighter) to pay',
  };
}
