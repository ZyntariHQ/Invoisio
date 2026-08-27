/**
 * Wallet handoff fallback helpers.
 *
 * Used by the wallet fallback share sheet shown when direct wallet handoff
 * fails or is unsupported on mobile. All helpers are defensive: they never
 * throw, so a failing share/clipboard API can never dead-end the payment flow.
 */

/**
 * Returns true when the Web Share API is available.
 * @param {Navigator | undefined} [nav]
 * @returns {boolean}
 */
export function isNativeShareSupported(nav = globalThis.navigator) {
  return typeof nav?.share === 'function';
}

/**
 * Builds the payload passed to navigator.share for a payment request.
 * Follows the established invoice share format: title, amount, payment URI.
 * @param {{
 *   invoiceNumber?: string;
 *   amountLabel?: string;
 *   paymentUri: string;
 * }} params
 * @returns {{ title: string; text: string }}
 */
export function buildPaymentSharePayload({ invoiceNumber, amountLabel, paymentUri }) {
  const title = invoiceNumber ? `Invoice ${invoiceNumber}` : 'Payment request';

  const lines = [];
  if (amountLabel) {
    lines.push(`Amount: ${amountLabel}`);
  }
  if (paymentUri) {
    lines.push(`Payment link: ${paymentUri}`);
  }

  return { title, text: lines.join('\n') };
}

/**
 * Shares a payment request via the Web Share API.
 * Never throws; inspect the returned outcome instead.
 * @param {{ title: string; text: string }} payload
 * @param {Navigator | undefined} [nav]
 * @returns {Promise<'shared' | 'dismissed' | 'unsupported' | 'failed'>}
 */
export async function sharePaymentRequest(payload, nav = globalThis.navigator) {
  if (!isNativeShareSupported(nav)) {
    return 'unsupported';
  }

  try {
    await nav.share(payload);
    return 'shared';
  } catch (error) {
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      return 'dismissed';
    }
    return 'failed';
  }
}

/**
 * Copies the exact payment URI to the clipboard.
 * Never throws; returns false when the clipboard is unavailable or fails.
 * @param {string} uri
 * @param {Navigator | undefined} [nav]
 * @returns {Promise<boolean>}
 */
export async function copyPaymentUri(uri, nav = globalThis.navigator) {
  if (!nav?.clipboard || typeof nav.clipboard.writeText !== 'function') {
    return false;
  }

  try {
    await nav.clipboard.writeText(uri);
    return true;
  } catch {
    return false;
  }
}
