'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Wallet,
  Coins,
  Bell,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import {
  SettingsService,
  PREFERRED_ASSETS,
  type MerchantProfile,
  type UserPreferences,
  type PreferredAsset,
} from '@/lib/settings-service';

/* ════════════════════════════════════════════════════════════════
 *  Types & constants
 * ════════════════════════════════════════════════════════════════ */

type TabId = 'profile' | 'payout' | 'asset' | 'notifications';

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Building2;
}

const TABS: Tab[] = [
  { id: 'profile', label: 'Business Profile', icon: Building2 },
  { id: 'payout', label: 'Payout Wallet', icon: Wallet },
  { id: 'asset', label: 'Preferred Asset', icon: Coins },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

const STELLAR_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/* ════════════════════════════════════════════════════════════════
 *  Shared UI helpers
 * ════════════════════════════════════════════════════════════════ */

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

function inputClasses(hasError?: boolean) {
  return `block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset transition-colors dark:text-white dark:bg-gray-800 ${
    hasError
      ? 'ring-red-400 focus:ring-red-600'
      : 'ring-gray-300 focus:ring-blue-600'
  }`;
}

function SaveButton({
  isSaving,
  disabled,
  label = 'Save Changes',
}: {
  isSaving: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || isSaving}
      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors"
    >
      {isSaving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Save className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
      {message}
    </p>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  1. Business Profile tab
 * ════════════════════════════════════════════════════════════════ */

function BusinessProfileTab({
  profile,
  onUpdated,
}: {
  profile: MerchantProfile;
  onUpdated: (p: MerchantProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [webhookUrl, setWebhookUrl] = useState(profile.webhookUrl ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync local state when profile prop changes after save
  useEffect(() => {
    setName(profile.name);
    setWebhookUrl(profile.webhookUrl ?? '');
  }, [profile]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Business name is required';
    if (name.trim().length > 100) next.name = 'Name must be 100 characters or fewer';
    if (webhookUrl.trim()) {
      try {
        const url = new URL(webhookUrl.trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
          next.webhookUrl = 'Webhook URL must use http or https';
        }
      } catch {
        next.webhookUrl = 'Enter a valid URL (e.g. https://example.com/webhook)';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    if (!validate()) return;

    setIsSaving(true);
    try {
      const updated = await SettingsService.updateMerchantSettings({
        name: name.trim(),
        webhookUrl: webhookUrl.trim() || undefined,
      });
      onUpdated(updated);
      setSuccess('Business profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {success && <SuccessBanner message={success} />}
      {error && <ErrorBanner message={error} />}

      {/* Read-only public key */}
      <div>
        <FieldLabel htmlFor="merchant-stellar-key">Stellar Public Key</FieldLabel>
        <div className="mt-1">
          <input
            id="merchant-stellar-key"
            type="text"
            readOnly
            value={profile.stellarPublicKey}
            className="block w-full rounded-md border-0 py-2 px-3 font-mono text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          This is the wallet address associated with your merchant account. It cannot be changed.
        </p>
      </div>

      {/* Business name */}
      <div>
        <FieldLabel htmlFor="merchant-name" required>
          Business Name
        </FieldLabel>
        <div className="mt-1">
          <input
            id="merchant-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className={inputClasses(!!errors.name)}
            placeholder="My Business LLC"
          />
        </div>
        {errors.name && <FieldError message={errors.name} />}
      </div>

      {/* Webhook URL */}
      <div>
        <FieldLabel htmlFor="merchant-webhook">
          Webhook URL{' '}
          <span className="font-normal text-gray-400">(optional)</span>
        </FieldLabel>
        <div className="mt-1">
          <input
            id="merchant-webhook"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            aria-invalid={!!errors.webhookUrl}
            aria-describedby={errors.webhookUrl ? 'webhook-error' : undefined}
            className={inputClasses(!!errors.webhookUrl)}
            placeholder="https://example.com/webhooks/invoisio"
          />
        </div>
        {errors.webhookUrl ? (
          <FieldError message={errors.webhookUrl} />
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Receive POST callbacks when invoice events occur (paid, overdue, etc.).
          </p>
        )}
      </div>

      <SaveButton isSaving={isSaving} />
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  2. Payout Wallet tab
 * ════════════════════════════════════════════════════════════════ */

function PayoutWalletTab({
  profile,
  onUpdated,
}: {
  profile: MerchantProfile;
  onUpdated: (p: MerchantProfile) => void;
}) {
  const [payoutKey, setPayoutKey] = useState(profile.payoutPublicKey ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setPayoutKey(profile.payoutPublicKey ?? '');
  }, [profile]);

  const validate = (): boolean => {
    if (!payoutKey.trim()) {
      setFieldError(null); // empty is OK — clears payout key
      return true;
    }
    if (!STELLAR_KEY_REGEX.test(payoutKey.trim())) {
      setFieldError(
        'Enter a valid Stellar public key starting with "G" (56 characters).',
      );
      return false;
    }
    setFieldError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    if (!validate()) return;

    setIsSaving(true);
    try {
      const updated = await SettingsService.updateMerchantSettings({
        payoutPublicKey: payoutKey.trim() || undefined,
      });
      onUpdated(updated);
      setSuccess(
        payoutKey.trim()
          ? 'Payout wallet updated. Payments will be sent to this address.'
          : 'Payout wallet cleared.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payout wallet.');
    } finally {
      setIsSaving(false);
    }
  };

  const isSameAsStellar =
    payoutKey.trim() && payoutKey.trim() === profile.stellarPublicKey;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {success && <SuccessBanner message={success} />}
      {error && <ErrorBanner message={error} />}

      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
        <p className="text-sm text-blue-900 dark:text-blue-200">
          <strong>How payouts work:</strong> When an invoice is paid, funds are
          received at your merchant&apos;s Stellar public key. Set a separate
          payout wallet below if you want disbursements routed to a different
          address.
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="payout-key" required={false}>
          Payout Wallet Address
        </FieldLabel>
        <div className="mt-1">
          <input
            id="payout-key"
            type="text"
            value={payoutKey}
            onChange={(e) => setPayoutKey(e.target.value)}
            maxLength={56}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? 'payout-error' : undefined}
            className={`${inputClasses(!!fieldError)} font-mono text-sm`}
            placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          />
        </div>
        {fieldError ? (
          <FieldError message={fieldError} />
        ) : isSameAsStellar ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            This is the same as your merchant public key. Consider using a
            separate wallet for payouts.
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Leave empty to use your merchant public key for all payouts.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SaveButton isSaving={isSaving} />
        {payoutKey.trim() && (
          <button
            type="button"
            onClick={() => setPayoutKey('')}
            className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  3. Preferred Asset tab
 * ════════════════════════════════════════════════════════════════ */

const ASSET_INFO: Record<string, { name: string; desc: string }> = {
  USDC: {
    name: 'USD Coin',
    desc: 'Stablecoin pegged to the US dollar. Ideal for merchants who want price stability.',
  },
  EURC: {
    name: 'Euro Coin',
    desc: 'Stablecoin pegged to the Euro. Settle payments in EUR without currency conversion.',
  },
  XLM: {
    name: 'Stellar Lumens',
    desc: 'Native Stellar asset. Lowest fees and fastest settlement on the network.',
  },
  USD: {
    name: 'USD (fiat reference)',
    desc: 'Reference pricing in US dollars. Payments settle in the equivalent crypto asset.',
  },
};

function PreferredAssetTab({
  profile,
  onUpdated,
}: {
  profile: MerchantProfile;
  onUpdated: (p: MerchantProfile) => void;
}) {
  const [selected, setSelected] = useState<PreferredAsset>(
    (profile.preferredAsset as PreferredAsset) || 'USDC',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected((profile.preferredAsset as PreferredAsset) || 'USDC');
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    setIsSaving(true);
    try {
      const updated = await SettingsService.updateMerchantSettings({
        preferredAsset: selected,
      });
      onUpdated(updated);
      setSuccess(`Preferred asset set to ${selected}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferred asset.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanged = selected !== profile.preferredAsset;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {success && <SuccessBanner message={success} />}
      {error && <ErrorBanner message={error} />}

      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select your default asset
        </p>
        <p className="mt-1 text-xs text-gray-500">
          This asset will be pre-selected when creating new invoices and payment requests.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PREFERRED_ASSETS.map((asset) => {
          const info = ASSET_INFO[asset];
          const isSelected = selected === asset;
          return (
            <button
              key={asset}
              type="button"
              onClick={() => setSelected(asset)}
              aria-pressed={isSelected}
              className={`flex flex-col items-start rounded-lg border p-4 text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 dark:border-blue-400 dark:bg-blue-950'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-base font-bold text-gray-900 dark:text-white">
                  {asset}
                </span>
                {isSelected && (
                  <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                )}
              </div>
              <span className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                {info.name}
              </span>
              <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {info.desc}
              </span>
            </button>
          );
        })}
      </div>

      <SaveButton isSaving={isSaving} disabled={!hasChanged} />
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  4. Notifications tab
 * ════════════════════════════════════════════════════════════════ */

function NotificationsTab({
  preferences,
  onUpdated,
}: {
  preferences: UserPreferences;
  onUpdated: (p: UserPreferences) => void;
}) {
  const [pushEnabled, setPushEnabled] = useState(preferences.pushNotificationsEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPushEnabled(preferences.pushNotificationsEnabled);
  }, [preferences]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    setIsSaving(true);
    try {
      await SettingsService.updatePushNotifications(pushEnabled);
      onUpdated({ ...preferences, pushNotificationsEnabled: pushEnabled });
      setSuccess(
        pushEnabled
          ? 'Push notifications enabled. You will receive alerts for paid and overdue invoices.'
          : 'Push notifications disabled.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanged = pushEnabled !== preferences.pushNotificationsEnabled;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {success && <SuccessBanner message={success} />}
      {error && <ErrorBanner message={error} />}

      {/* Push notification toggle */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Invoice Push Notifications
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Receive real-time alerts on your mobile device when invoices are
              paid or become overdue. Powered by Expo push notifications.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pushEnabled}
            aria-label="Toggle push notifications"
            onClick={() => setPushEnabled(!pushEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
              pushEnabled
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                pushEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Info card about webhook notifications */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            <ExternalLink className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              Webhook Notifications
            </h4>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Configure a webhook URL in{' '}
              <span className="font-medium">Business Profile</span> to receive
              server-to-server callbacks for invoice events.
            </p>
          </div>
        </div>
      </div>

      <SaveButton isSaving={isSaving} disabled={!hasChanged} />
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Main settings content
 * ════════════════════════════════════════════════════════════════ */

function SettingsContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [merchantProfile, userPrefs] = await Promise.all([
        SettingsService.getMerchantProfile(),
        SettingsService.getUserPreferences(),
      ]);
      setProfile(merchantProfile);
      setPreferences(userPrefs);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Failed to load settings. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  /* ── Error state ── */
  if (loadError) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          Could not load settings
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{loadError}</p>
        <button
          type="button"
          onClick={() => fetchAll()}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!profile || !preferences) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/invoices')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </button>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Manage your business profile, payout configuration, and notification preferences.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="mb-8 border-b border-gray-200 dark:border-gray-700">
        <nav className="flex flex-wrap gap-1" aria-label="Settings tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
        {activeTab === 'profile' && (
          <BusinessProfileTab profile={profile} onUpdated={setProfile} />
        )}
        {activeTab === 'payout' && (
          <PayoutWalletTab profile={profile} onUpdated={setProfile} />
        )}
        {activeTab === 'asset' && (
          <PreferredAssetTab profile={profile} onUpdated={setProfile} />
        )}
        {activeTab === 'notifications' && (
          <NotificationsTab
            preferences={preferences}
            onUpdated={setPreferences}
          />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Page export (auth-guarded)
 * ════════════════════════════════════════════════════════════════ */

export default function SettingsPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-12 dark:bg-gray-950 sm:px-6 lg:px-8">
        <SettingsContent />
      </div>
    </RequireAuth>
  );
}
