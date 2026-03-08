type FreighterLike = {
  requestAccess?: () => Promise<unknown>;
  getPublicKey?: () => Promise<unknown>;
  signMessage?: (message: string, opts?: unknown) => Promise<unknown>;
};

declare global {
  interface Window {
    freighterApi?: FreighterLike;
    freighter?: FreighterLike;
  }
}

function getFreighterApi(): FreighterLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.freighterApi ?? window.freighter ?? null;
}

function looksLikePublicKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('G') && value.length === 56;
}

function toBase64(value: Uint8Array): string {
  let raw = '';
  for (let i = 0; i < value.length; i += 1) {
    raw += String.fromCharCode(value[i]);
  }

  return btoa(raw);
}

function extractSignature(result: unknown): string | null {
  if (typeof result === 'string' && result.length > 0) {
    return result;
  }

  if (result != null && typeof result === 'object') {
    const data = result as {
      signature?: unknown;
      signedMessage?: unknown;
      signed_message?: unknown;
    };

    if (typeof data.signature === 'string' && data.signature.length > 0) {
      return data.signature;
    }

    if (data.signature instanceof Uint8Array) {
      return toBase64(data.signature);
    }

    if (
      typeof data.signedMessage === 'string' &&
      data.signedMessage.length > 0
    ) {
      return data.signedMessage;
    }

    if (
      typeof data.signed_message === 'string' &&
      data.signed_message.length > 0
    ) {
      return data.signed_message;
    }
  }

  return null;
}

export function isFreighterInstalled(): boolean {
  const api = getFreighterApi();
  return api != null;
}

export async function requestFreighterPublicKey(): Promise<string> {
  const api = getFreighterApi();

  if (!api) {
    throw new Error('Freighter is not installed.');
  }

  if (typeof api.requestAccess === 'function') {
    const accessResult = await api.requestAccess();
    if (looksLikePublicKey(accessResult)) {
      return accessResult;
    }
  }

  if (typeof api.getPublicKey === 'function') {
    const keyResult = await api.getPublicKey();

    if (looksLikePublicKey(keyResult)) {
      return keyResult;
    }

    if (keyResult != null && typeof keyResult === 'object') {
      const data = keyResult as { publicKey?: unknown; address?: unknown };
      if (looksLikePublicKey(data.publicKey)) {
        return data.publicKey;
      }
      if (looksLikePublicKey(data.address)) {
        return data.address;
      }
    }
  }

  throw new Error('Unable to read public key from Freighter.');
}

export async function signChallengeWithFreighter(
  challenge: string,
): Promise<string> {
  const api = getFreighterApi();

  if (!api || typeof api.signMessage !== 'function') {
    throw new Error('Freighter does not support message signing in this browser.');
  }

  try {
    const result = await api.signMessage(challenge);
    const signature = extractSignature(result);

    if (!signature) {
      throw new Error('Could not extract a signature from Freighter response.');
    }

    return signature;
  } catch (error) {
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: unknown }).code === 4001
    ) {
      throw new Error('Signature request was rejected by user.');
    }

    if (
      error instanceof Error &&
      /(reject|denied|declin)/i.test(error.message)
    ) {
      throw new Error('Signature request was rejected by user.');
    }

    throw error;
  }
}
