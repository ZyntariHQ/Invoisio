/**
 * Parses scanned QR code strings into Stellar payment data.
 *
 * Supports:
 *  1. SEP-0007 pay URI — web+stellar:pay?destination=...&amount=...&memo=...
 *  2. Raw G-address (56-char Stellar public key)
 *  3. Invoisio deep-link — invoisio://pay?...  (same query params as SEP-0007)
 */

export type MemoType = "text" | "id" | "hash" | "return";

export interface ParsedPayment {
  destination: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  memoType: MemoType;
  /** Reconstructed SEP-0007 URI ready to deep-link into a Stellar wallet */
  sep0007Uri: string;
}

const G_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

function isValidGAddress(addr: string): boolean {
  return G_ADDRESS_RE.test(addr);
}

function parseMemoType(raw: string | null): MemoType {
  switch (raw?.toLowerCase()) {
    case "text":
      return "text";
    case "id":
      return "id";
    case "hash":
      return "hash";
    case "return":
      return "return";
    default:
      return "text";
  }
}

function buildSep0007Uri(p: Omit<ParsedPayment, "sep0007Uri">): string {
  const parts = [`destination=${encodeURIComponent(p.destination)}`];
  if (p.amount) parts.push(`amount=${encodeURIComponent(p.amount)}`);
  if (p.assetCode) parts.push(`asset_code=${encodeURIComponent(p.assetCode)}`);
  if (p.assetIssuer) parts.push(`asset_issuer=${encodeURIComponent(p.assetIssuer)}`);
  if (p.memo) {
    parts.push(`memo=${encodeURIComponent(p.memo)}`);
    parts.push(`memo_type=${p.memoType}`);
  }
  return `web+stellar:pay?${parts.join("&")}`;
}

/**
 * @returns ParsedPayment on success, or a string error message on failure.
 */
export function parseQrCode(raw: string): ParsedPayment | string {
  const trimmed = raw.trim();

  // 1. Raw G-address
  if (isValidGAddress(trimmed)) {
    const parsed: Omit<ParsedPayment, "sep0007Uri"> = {
      destination: trimmed,
      memoType: "text",
    };
    return { ...parsed, sep0007Uri: buildSep0007Uri(parsed) };
  }

  // 2. SEP-0007 or Invoisio deep-link
  const isSep0007 = trimmed.startsWith("web+stellar:pay?");
  const isInvoisio = trimmed.startsWith("invoisio://pay?");

  if (!isSep0007 && !isInvoisio) {
    return "Unsupported QR code format. Expected a Stellar address or web+stellar: payment link.";
  }

  let queryString: string;
  if (isSep0007) {
    queryString = trimmed.slice("web+stellar:pay?".length);
  } else {
    queryString = trimmed.slice("invoisio://pay?".length);
  }

  // URLSearchParams works in React Native (Hermes supports it)
  const params = new URLSearchParams(queryString);
  const destination = params.get("destination");

  if (!destination) {
    return "QR code is missing a destination address.";
  }

  if (!isValidGAddress(destination)) {
    return `Invalid destination address: ${destination}`;
  }

  const memoType = parseMemoType(params.get("memo_type"));

  const parsed: Omit<ParsedPayment, "sep0007Uri"> = {
    destination,
    memoType,
    ...(params.get("amount") !== null && { amount: params.get("amount")! }),
    ...(params.get("asset_code") !== null && { assetCode: params.get("asset_code")! }),
    ...(params.get("asset_issuer") !== null && { assetIssuer: params.get("asset_issuer")! }),
    ...(params.get("memo") !== null && { memo: params.get("memo")! }),
  };

  return { ...parsed, sep0007Uri: buildSep0007Uri(parsed) };
}
