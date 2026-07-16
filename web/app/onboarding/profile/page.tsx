'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingShell, OnboardingActions } from '@/components/onboarding-shell';
import {
  MerchantService,
  type MerchantProfile,
} from '@/lib/merchant-service';
import { extractApiErrorMessage } from '@/lib/api-client';

export default function OnboardingProfilePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated: MerchantProfile = await MerchantService.updateSettings({
        name: name.trim(),
      });
      await MerchantService.updateChecklist({
        profileCompleted: Boolean(updated.name && updated.name.length > 0),
      });
      router.push('/onboarding/payout');
    } catch (err) {
      setError(extractApiErrorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <OnboardingShell
      title="Complete your merchant profile"
      subtitle="Your business name appears on invoices and receipts sent to clients."
    >
      <label htmlFor="merchant-name" className="block text-sm font-medium text-gray-700">
        Business name
      </label>
      <input
        id="merchant-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Acme Studio LLC"
        className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900" role="alert">
          {error}
        </p>
      )}
      <OnboardingActions onSave={handleSave} isSaving={isSaving} nextHref="/onboarding/asset" />
    </OnboardingShell>
  );
}
