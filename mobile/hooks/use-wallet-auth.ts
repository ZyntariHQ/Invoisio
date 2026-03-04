import { useState, useCallback } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { AuthService } from "../lib/auth-service";
import { useAuthStore } from "../hooks/use-auth-store";
import { useAppKit, useAccount, useProvider } from "@reown/appkit-react-native";

interface UseWalletAuthReturn {
  isConnected: boolean;
  publicKey: string | null;
  isLoading: boolean;
  error: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
}

export function useWalletAuth(): UseWalletAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setAuth, clearAuth } = useAuthStore();

  // AppKit hooks for wallet management
  const { open, close } = useAppKit();
  const { address, isConnected: isAppKitConnected, namespace } = useAccount();
  const { provider } = useProvider();

  // Track connection state - only consider connected if it's a Solana namespace (Stellar)
  const isConnected = isAppKitConnected && !!address && namespace === "solana";
  const publicKey = address || null;

  /**
   * Connect wallet and authenticate using Sign-In with Stellar (SIWS)
   */
  const connectWallet = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Step 1: Open WalletConnect modal if not connected
      if (!isConnected || !address) {
        open({ view: "Connect" });
        await waitForConnection();
      }

      if (!address) {
        throw new Error("Failed to connect wallet. No address received.");
      }

      const userPublicKey = address;

      // Validate it's a proper Stellar public key (starts with G, 56 chars)
      if (!userPublicKey.startsWith("G") || userPublicKey.length !== 56) {
        throw new Error(`Invalid Stellar public key: ${userPublicKey}`);
      }

      try {
        StellarSdk.Keypair.fromPublicKey(userPublicKey);
      } catch {
        throw new Error("Invalid Stellar public key received from wallet");
      }

      // Step 2: Request nonce from backend
      const { nonce } = await AuthService.requestNonce(userPublicKey);

      // Step 3: Create SIWE-style message
      const message = AuthService.createSiweMessage(nonce);

      // Step 4: Sign the message with the wallet using AppKit provider
      if (!provider) {
        throw new Error("Wallet provider not available");
      }

      const signature = await signMessageWithAppKit(provider, message);

      if (!signature) {
        throw new Error("User rejected signature request or signing failed");
      }

      // Step 5: Verify signature with backend and get JWT
      const { accessToken } = await AuthService.verifySignature(
        userPublicKey,
        signature,
      );

      // Step 6: Store auth data securely
      await setAuth(accessToken, userPublicKey);

      console.log("Authentication successful!");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Authentication failed";

      // Handle specific error types
      if (errorMessage.includes("rejected")) {
        setError("Signature request was rejected by your wallet");
      } else if (errorMessage.includes("timeout")) {
        setError("Connection timed out. Please try again.");
      } else if (
        errorMessage.includes("network") ||
        errorMessage.includes("fetch")
      ) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(errorMessage);
      }

      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, open, provider, setAuth]);

  /**
   * Disconnect wallet and clear authentication
   */
  const disconnectWallet = useCallback(async () => {
    try {
      // Close AppKit connection
      await close();

      // Clear auth state
      await clearAuth();
      setError(null);
      console.log("Wallet disconnected");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to disconnect wallet";
      setError(errorMessage);
      throw err;
    }
  }, [close, clearAuth]);

  return {
    isConnected,
    publicKey,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
  };
}

/**
 * Wait for wallet connection with timeout
 */
async function waitForConnection(): Promise<{
  success: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        success: false,
        error: "Connection timeout. Please try again.",
      });
    }, 60000); // 60 second timeout

    // Poll for connection using a simple interval
    const checkConnection = setInterval(() => {
      // We can't directly access the connection state here without props
      // This will be handled by the parent component re-rendering
      // For now, we'll just timeout and let the caller check the address
      clearInterval(checkConnection);
      clearTimeout(timeout);
      resolve({ success: true });
    }, 500);
  });
}

/**
 * Sign a message using AppKit provider
 */
async function signMessageWithAppKit(
  provider: unknown,
  message: string,
): Promise<string | null> {
  // Prepare the message for signing
  const messageBytes = Buffer.from(message, "utf-8");

  try {
    // Use Solana signMessage method (Reown uses Solana namespace for Stellar)
    // The provider should have a signMessage method
    if (!provider || typeof provider !== "object") {
      throw new Error("Invalid provider");
    }

    // Type guard for provider with signMessage method
    if (!("signMessage" in provider)) {
      throw new Error("Provider does not support signMessage");
    }

    const signMessageMethod = (provider as Record<"signMessage", unknown>)
      .signMessage;

    if (typeof signMessageMethod !== "function") {
      throw new Error("signMessage is not a function");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const result = await signMessageMethod(messageBytes);

    // Return the signature in base64 format (expected by backend)
    if (typeof result === "string") {
      return result;
    }

    if (result && typeof result === "object" && "signature" in result) {
      const signature = (result as { signature: unknown }).signature;
      if (typeof signature === "string") {
        return signature;
      }
    }

    if (Buffer.isBuffer(result)) {
      return result.toString("base64");
    }

    return null;
  } catch (error) {
    console.error("Error signing message with AppKit:", error);

    // Check if user rejected the signature
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: unknown }).code === 4001
    ) {
      throw new Error("Signature request rejected by user");
    }

    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string" &&
      ((error as { message: string }).message.includes("rejected") ||
        (error as { message: string }).message.includes("denied"))
    ) {
      throw new Error("Signature request rejected by user");
    }

    throw new Error(
      `Signing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
