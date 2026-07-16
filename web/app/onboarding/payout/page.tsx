'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingShell, OnboardingActions } from '@/components/onboarding-shell';
import {
  MerchantService,
  type MerchantProfile,
} from '@/lib/merchant-service';
import { extractApiErrorMessage } from '@/lib/api-client';

const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;

export default function OnboardingPayoutPage() {
  const router = useRouter();
  const [payoutPublicKey, setPayoutPublicKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated: MerchantProfile = await MerchantService.updateSettings({
        payoutPublicKey: payoutPublicKey.trim(),
      });
      await MerchantService.updateChecklist({
        payoutKeyCompleted: Boolean(updated.payoutPublicKey),
      });
      router.push('/onboarding/asset');
    } catch (err) {
      setError(extractApiErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    router.push('/onboarding/asset');
  };

  return (
    <OnboardingShell
      title="Add your payout key"
      subtitle="Provide a Stellar public key (starts with G) where settlement funds are sent."
      footer={
        <span>
          This is the destination for your merchant payouts. You can change it
          later in your merchant settings.
        </span>
      }
    >
      <label htmlFor="payout-key" className="block text-sm font-medium text-gray-700">
        Payout Stellar public key
      </label>
      <input
        id="payout-key"
        type="text"
        value={payoutPublicKey}
        onChange={(e) => setPayoutPublicKey(e.target.value)}
        placeholder="G..."
        className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
      {payoutPublicKey.length > 0 && !STELLAR_KEY_RE.test(payoutPublicKey.trim()) && (
        <p className="mt-2 text-xs text-amber-700">
          This doesn’t look like a valid Stellar public key (must start with G and be 56 characters).
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900" role="alert">
          {error}
        </p>
      )}
      <OnboardingActions
        onSave={handleSave}
        onSkip={handleSkip}
        isSaving={isSaving}
        nextHref="/onboarding/asset"
      />
    </OnboardingShell>
  );
}
