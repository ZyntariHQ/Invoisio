'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/require-auth';
import {
  MerchantService,
  type MerchantProfile,
} from '@/lib/merchant-service';
import { UserService } from '@/lib/user-service';

const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;
const ASSETS = ['USDC', 'EURC', 'XLM', 'USD'] as const;
type Asset = (typeof ASSETS)[number];

const TABS = [
  { id: 'profile', label: 'Business profile' },
  { id: 'payout', label: 'Payout wallet' },
  { id: 'asset', label: 'Preferred asset' },
  { id: 'notifications', label: 'Notifications' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface SectionProps {
  profile: MerchantProfile;
  onSaved: (updated: MerchantProfile) => void;
}

/** Shared card wrapper so every tab renders with the same look. */
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Inline save feedback: red banner for errors, green banner on success. */
function SaveFeedback({
  error,
  success,
}: {
  error: string | null;
  success: string | null;
}) {
  if (error) {
    return (
      <p
        className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900"
        role="alert"
      >
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p
        className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900"
        role="status"
      >
        {success}
      </p>
    );
  }
  return null;
}

function SaveButton({
  onClick,
  isSaving,
  disabled,
  label = 'Save changes',
}: {
  onClick: () => void;
  isSaving: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSaving || disabled}
      className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
    >
      {isSaving ? 'Saving…' : label}
    </button>
  );
}

function ProfileSection({ profile, onSaved }: SectionProps) {
  const [name, setName] = useState(profile.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0;

  const handleSave = async () => {
    if (isSaving || !isValid) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await MerchantService.updateSettings({ name: trimmed });
      // Keep the activation checklist in sync with the new merchant state.
      await MerchantService.syncChecklist();
      onSaved(updated);
      setSuccess('Business profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard
      title="Business profile"
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
      />
      {!isValid && (
        <p className="mt-2 text-xs text-amber-700">
          Business name can’t be empty.
        </p>
      )}
      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
        Wallet public key:{' '}
        <span className="font-mono break-all">{profile.stellarPublicKey}</span>
      </div>
      <SaveFeedback error={error} success={success} />
      <SaveButton onClick={handleSave} isSaving={isSaving} disabled={!isValid} />
    </SectionCard>
  );
}

function PayoutSection({ profile, onSaved }: SectionProps) {
  const [payoutPublicKey, setPayoutPublicKey] = useState(
    profile.payoutPublicKey ?? '',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const trimmed = payoutPublicKey.trim();
  const isValid = STELLAR_KEY_RE.test(trimmed);

  const handleSave = async () => {
    if (isSaving || !isValid) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await MerchantService.updateSettings({
        payoutPublicKey: trimmed,
      });
      await MerchantService.syncChecklist();
      onSaved(updated);
      setSuccess('Payout wallet saved.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save payout wallet.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard
      title="Payout wallet"
      subtitle="The Stellar public key (starts with G) where settlement funds are sent."
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
      />
      {trimmed.length > 0 && !isValid && (
        <p className="mt-2 text-xs text-amber-700">
          This doesn’t look like a valid Stellar public key (must start with G and be 56 characters).
        </p>
      )}
      <SaveFeedback error={error} success={success} />
      <SaveButton onClick={handleSave} isSaving={isSaving} disabled={!isValid} />
    </SectionCard>
  );
}

function AssetSection({ profile, onSaved }: SectionProps) {
  const initial = (ASSETS as readonly string[]).includes(profile.preferredAsset)
    ? (profile.preferredAsset as Asset)
    : 'USDC';
  const [preferredAsset, setPreferredAsset] = useState<Asset>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await MerchantService.updateSettings({ preferredAsset });
      await MerchantService.syncChecklist();
      onSaved(updated);
      setSuccess('Preferred asset saved.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save preferred asset.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard
      title="Preferred asset"
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
      <SaveFeedback error={error} success={success} />
      <SaveButton onClick={handleSave} isSaving={isSaving} label="Save preference" />
    </SectionCard>
  );
}

function NotificationsSection({ profile, onSaved }: SectionProps) {
  const [webhookUrl, setWebhookUrl] = useState(profile.webhookUrl ?? '');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    UserService.getNotificationPreferences()
      .then((prefs) => {
        setPushEnabled(prefs.pushNotificationsEnabled);
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load notification settings.',
        );
      });
  }, []);

  const trimmedWebhook = webhookUrl.trim();
  const isWebhookValid =
    trimmedWebhook.length === 0 || /^https?:\/\/\S+$/.test(trimmedWebhook);

  const handleSave = async () => {
    if (isSaving || !isWebhookValid) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await MerchantService.updateSettings({
        webhookUrl: trimmedWebhook,
      });
      await UserService.updateNotificationPreferences({
        pushNotificationsEnabled: pushEnabled,
      });
      onSaved(updated);
      setSuccess('Notification settings saved.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save notification settings.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard
      title="Notifications"
      subtitle="Choose how you hear about invoice payments and overdue reminders."
    >
      <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700">
        Webhook URL
      </label>
      <input
        id="webhook-url"
        type="url"
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
        placeholder="https://example.com/webhooks/invoisio"
        className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <p className="mt-2 text-xs text-gray-500">
        We POST invoice lifecycle events to this URL. Leave blank to disable
        webhook notifications.
      </p>
      {!isWebhookValid && (
        <p className="mt-2 text-xs text-amber-700">
          Webhook URL must start with http:// or https://.
        </p>
      )}

      <div className="mt-6 flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Push notifications</p>
          <p className="mt-1 text-xs text-gray-500">
            Get a push notification on your mobile devices when an invoice is
            paid or becomes overdue.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={pushEnabled}
          onClick={() => setPushEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            pushEnabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className="sr-only">Toggle push notifications</span>
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              pushEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <SaveFeedback error={error} success={success} />
      <SaveButton
        onClick={handleSave}
        isSaving={isSaving}
        disabled={!isWebhookValid}
      />
    </SectionCard>
  );
}

function SettingsContent() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    MerchantService.getProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load settings.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl">
        <p
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 h-10 w-full animate-pulse rounded-lg bg-gray-100" />
        <div className="mt-4 h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/"
        className="mb-6 inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        ← Back to dashboard
      </Link>
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
      <p className="mt-2 text-sm text-gray-500">
        Manage your business profile, payout configuration, and notification
        preferences.
      </p>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="mt-6 flex flex-wrap gap-2 border-b border-gray-200 pb-px"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {activeTab === 'profile' && (
          <ProfileSection profile={profile} onSaved={setProfile} />
        )}
        {activeTab === 'payout' && (
          <PayoutSection profile={profile} onSaved={setProfile} />
        )}
        {activeTab === 'asset' && (
          <AssetSection profile={profile} onSaved={setProfile} />
        )}
        {activeTab === 'notifications' && (
          <NotificationsSection profile={profile} onSaved={setProfile} />
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <SettingsContent />
      </div>
    </RequireAuth>
  );
}
