'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingShell, OnboardingActions } from '@/components/onboarding-shell';
import {
  MerchantService,
  type MerchantProfile,
} from '@/lib/merchant-service';
import { extractApiErrorMessage } from '@/lib/api-client';

const ASSETS = ['USDC', 'EURC', 'XLM', 'USD'] as const;
type Asset = (typeof ASSETS)[number];

export default function OnboardingAssetPage() {
  const router = useRouter();
  const [preferredAsset, setPreferredAsset] = useState<Asset>('USDC');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated: MerchantProfile = await MerchantService.updateSettings({
        preferredAsset,
      });
      await MerchantService.updateChecklist({
        assetPreferenceCompleted: Boolean(updated.preferredAsset),
      });
      router.push('/');
    } catch (err) {
      setError(extractApiErrorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <OnboardingShell
      title="Choose your default asset"
      subtitle="New invoices will default to this asset unless you change it per invoice."
    >
      <fieldset>
        <legend className="sr-only">Preferred asset</legend>
        <div className="grid grid-cols-2 gap-3">
          {ASSETS.map((asset) => {
            const active = asset === preferredAsset;
            return (
              <button
                key={asset}
                type="button"
                onClick={() => setPreferredAsset(asset)}
                aria-pressed={active}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {asset}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900" role="alert">
          {error}
        </p>
      )}
      <OnboardingActions
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel="Save preference"
        nextHref="/"
      />
    </OnboardingShell>
  );
}
