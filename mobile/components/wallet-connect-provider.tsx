import React, { ReactNode, useEffect, useState } from "react";
import { createAppKit, AppKitNetwork } from "@reown/appkit-react-native";
import { REOWN_PROJECT_ID } from "@env";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Stellar testnet configuration
const stellarTestnet: AppKitNetwork = {
  id: "stellar-testnet",
  name: "Stellar Testnet",
  chainNamespace: "solana", // Reown uses 'solana' namespace for Stellar
  caipNetworkId: "solana:stellar-testnet",
  rpcUrls: {
    default: {
      http: ["https://horizon-testnet.stellar.org"],
    },
  },
  testnet: true,
  nativeCurrency: {
    name: "XLM",
    symbol: "XLM",
    decimals: 7,
  },
};

// Storage adapter for React Native
const storageAdapter = {
  getKeys: async (): Promise<string[]> => {
    const keys = await AsyncStorage.getAllKeys();
    return [...keys];
  },
  getEntries: async (): Promise<[string, any][]> => {
    const keys = await AsyncStorage.getAllKeys();
    const entries: [string, any][] = [];

    for (const key of keys) {
      const value = await AsyncStorage.getItem(key);
      if (value) {
        entries.push([key, JSON.parse(value)]);
      }
    }

    return entries;
  },
  getItem: async (key: string): Promise<any> => {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  },
  setItem: async (key: string, value: any): Promise<void> => {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  removeItem: async (key: string): Promise<void> => {
    await AsyncStorage.removeItem(key);
  },
};

interface WalletConnectProviderProps {
  children: ReactNode;
}

export const WalletConnectProvider: React.FC<WalletConnectProviderProps> = ({
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeAppKit = async () => {
      try {
        if (
          !REOWN_PROJECT_ID ||
          REOWN_PROJECT_ID === "your-reown-project-id-here"
        ) {
          console.error(
            "REOWN_PROJECT_ID not configured. Please set it in your .env file",
          );
          setIsInitialized(false);
          return;
        }

        await createAppKit({
          adapters: [],
          networks: [stellarTestnet],
          metadata: {
            name: "Invoisio Mobile",
            description: "AI-powered invoice factoring with Stellar payments",
            url: "https://invoisio.com",
            icons: [
              "https://avatars.githubusercontent.com/u/177742692?s=200&v=4",
            ],
          },
          projectId: REOWN_PROJECT_ID,
          storage: storageAdapter,
          enableAnalytics: false,
        });

        setIsInitialized(true);
        console.log("AppKit initialized successfully");
      } catch (error) {
        console.error("Error initializing AppKit:", error);
        setIsInitialized(false);
      }
    };

    void initializeAppKit();
  }, []);

  if (!isInitialized) {
    return null;
  }

  return <>{children}</>;
};
