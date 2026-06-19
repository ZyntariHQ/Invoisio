'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useWalletAuth } from './use-wallet-auth';

export interface MerchantWallet {
  id: string;
  name: string;
  publicKey: string;
  balance: string;
  balanceUSD: string;
  currency: string;
  avatar?: string;
}

export interface MerchantContext {
  merchantId: string;
  wallet: MerchantWallet | null;
}

export function useMerchant() {
  const { publicKey, isAuthenticated } = useWalletAuth();

  const { data: wallet, isLoading, error } = useQuery({
    queryKey: ['merchant-wallet', publicKey],
    queryFn: async () => {
      if (!publicKey) return null;

      try {
        const userResponse = await apiClient.request<{
          id: string;
          merchantId?: string;
          publicKey: string;
          createdAt: string;
        }>({
          method: 'GET',
          url: '/auth/me',
        });

        const merchantId = userResponse.data?.merchantId || userResponse.data?.id;
        const resolvedPublicKey = userResponse.data?.publicKey || publicKey;
        const alias = resolvedPublicKey ? `Merchant ${resolvedPublicKey.slice(0, 6)}` : 'My Merchant';

        return {
          id: merchantId,
          name: alias,
          publicKey: resolvedPublicKey,
          balance: '0',
          balanceUSD: '0',
          currency: 'XLM',
        } as MerchantWallet;
      } catch (err) {
        console.error('Failed to fetch merchant wallet:', err);
        return null;
      }
    },
    enabled: isAuthenticated && !!publicKey,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    wallet,
    isLoading,
    error,
    merchantId: wallet?.id,
  };
}
