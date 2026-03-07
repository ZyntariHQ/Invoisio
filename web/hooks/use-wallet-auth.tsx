'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AuthService } from '@/lib/auth-service';
import {
  isFreighterInstalled,
  requestFreighterPublicKey,
  signChallengeWithFreighter,
} from '@/lib/freighter-auth';
import { setApiAccessToken } from '@/lib/api-client';

type WalletStatus = 'disconnected' | 'connected' | 'signed-in';

type StoredAuth = {
  accessToken: string | null;
  publicKey: string | null;
};

const AUTH_STORAGE_KEY = 'invoisio:web:wallet-auth';

interface WalletAuthContextValue {
  status: WalletStatus;
  publicKey: string | null;
  isFreighterReady: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  message: string | null;
  error: string | null;
  connectWallet: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  clearMessage: () => void;
}

const WalletAuthContext = createContext<WalletAuthContextValue | null>(null);

function readStoredAuth(): StoredAuth {
  if (typeof window === 'undefined') {
    return { accessToken: null, publicKey: null };
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (raw == null || raw.length === 0) {
    return { accessToken: null, publicKey: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    return {
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
      publicKey: typeof parsed.publicKey === 'string' ? parsed.publicKey : null,
    };
  } catch {
    return { accessToken: null, publicKey: null };
  }
}

function persistAuth(next: StoredAuth): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
}

function clearStoredAuth(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function normalizeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/not installed/i.test(message)) {
    return 'Freighter wallet is not installed. Install the extension to continue.';
  }

  if (/reject|denied|declin/i.test(message)) {
    return 'Signature request was rejected. Please approve it in Freighter to sign in.';
  }

  if (/invalid signature/i.test(message)) {
    return 'The signature could not be verified. Please try again.';
  }

  if (/nonce|challenge/i.test(message)) {
    return 'Could not get a valid sign-in challenge. Please retry.';
  }

  return message || 'Authentication failed. Please try again.';
}

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isFreighterReady, setIsFreighterReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const freighterReady = isFreighterInstalled();
    setIsFreighterReady(freighterReady);

    const stored = readStoredAuth();
    if (stored.accessToken) {
      setApiAccessToken(stored.accessToken);
      setPublicKey(stored.publicKey);
      setStatus('signed-in');
    } else if (stored.publicKey) {
      setPublicKey(stored.publicKey);
      setStatus('connected');
    } else {
      setStatus('disconnected');
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    const validateExistingToken = async () => {
      const stored = readStoredAuth();
      if (!stored.accessToken) {
        return;
      }

      try {
        setApiAccessToken(stored.accessToken);
        await AuthService.getMe();
      } catch {
        setApiAccessToken(null);
        clearStoredAuth();
        setPublicKey(null);
        setStatus('disconnected');
      }
    };

    void validateExistingToken();
  }, []);

  const connectWallet = useCallback(async () => {
    setError(null);
    setMessage(null);

    if (!isFreighterInstalled()) {
      setIsFreighterReady(false);
      const msg = 'Freighter wallet is not installed.';
      setError(msg);
      throw new Error(msg);
    }

    setIsLoading(true);

    try {
      const key = await requestFreighterPublicKey();
      setPublicKey(key);
      setStatus('connected');
      persistAuth({ accessToken: null, publicKey: key });
      setMessage(`Wallet connected: ${key.slice(0, 6)}...${key.slice(-4)}`);
    } catch (err) {
      const normalized = normalizeAuthError(err);
      setError(normalized);
      throw new Error(normalized);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      let key = publicKey;
      if (!key) {
        key = await requestFreighterPublicKey();
        setPublicKey(key);
        setStatus('connected');
      }

      const { nonce } = await AuthService.requestChallenge(key);
      const signedNonce = await signChallengeWithFreighter(nonce);
      const { accessToken } = await AuthService.verifySignature(key, signedNonce);

      setApiAccessToken(accessToken);
      persistAuth({ accessToken, publicKey: key });
      setPublicKey(key);
      setStatus('signed-in');

      // Confirm protected API access immediately after token issuance.
      await AuthService.getMe();

      setMessage('Signed in successfully. Protected API access is active.');
    } catch (err) {
      const normalized = normalizeAuthError(err);
      setError(normalized);
      throw new Error(normalized);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  const signOut = useCallback(() => {
    setApiAccessToken(null);
    clearStoredAuth();
    setPublicKey(null);
    setStatus('disconnected');
    setError(null);
    setMessage('Signed out successfully.');
  }, []);

  const clearMessage = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);

  const value = useMemo<WalletAuthContextValue>(
    () => ({
      status,
      publicKey,
      isFreighterReady,
      isLoading,
      isAuthenticated: status === 'signed-in',
      message,
      error,
      connectWallet,
      signIn,
      signOut,
      clearMessage,
    }),
    [
      status,
      publicKey,
      isFreighterReady,
      isLoading,
      message,
      error,
      connectWallet,
      signIn,
      signOut,
      clearMessage,
    ],
  );

  return (
    <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>
  );
}

export function useWalletAuth(): WalletAuthContextValue {
  const context = useContext(WalletAuthContext);
  if (context == null) {
    throw new Error('useWalletAuth must be used within WalletAuthProvider');
  }
  return context;
}
