import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../hooks/use-auth-store';
import { MerchantService } from '../lib/merchant-service';
import { type Customer } from '../lib/customer-service';
import { CustomerPicker } from '../components/CustomerPicker';
import { useOfflineMutation } from '../hooks/use-offline-mutation';
import { useDraftAutosave } from '../hooks/use-draft-autosave';
import { useConnectivity } from '../hooks/use-connectivity';
import axios from 'axios';
import { API_URL } from '@env';

const currencies = ['USDC', 'EURC', 'USD'];
const paymentTerms = ['Net 7', 'Net 14', 'Net 30'];

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { isOffline } = useConnectivity();

  // Form state
  const [company, setCompany] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDC');
  const [terms, setTerms] = useState('Net 14');
  const [memo, setMemo] = useState('');
  const [payoutKey, setPayoutKey] = useState<string | null>(null);

  // Customer selection state (managed by CustomerPicker)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );

  /**
   * Draft autosave hook integration
   * All form changes are automatically saved as drafts
   */
  const {
    draft,
    isLoading: isLoadingDraft,
    isSaving,
    error: draftError,
    lastSavedAt,
    updateDraft,
    saveDraft,
    convertToInvoice,
    discardDraft,
    isComplete,
    completionPercentage,
  } = useDraftAutosave(undefined, {
    autosaveDelay: 3000,
    minAutosaveInterval: 5000,
    onSave: () => {
      // Optionally show a small indicator
      console.log('Draft saved successfully');
    },
    onError: (err) => {
      console.error('Draft autosave error:', err);
    },
  });

  // Load merchant preferred asset and payout key on mount
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await MerchantService.getProfile(accessToken);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled may be mutated by cleanup
        if (!cancelled) {
          // Pre-select the merchant's preferred asset if it's in the currency list
          if (currencies.includes(profile.preferredAsset)) {
            setCurrency(profile.preferredAsset);
          }
          setPayoutKey(profile.payoutPublicKey ?? null);
        }
      } catch (err) {
        console.error('Failed to load merchant settings:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Load draft data into form when loaded
  useEffect(() => {
    if (draft) {
      setCompany(draft.clientName || '');
      setAmount(draft.amount ? String(draft.amount) : '');
      setCurrency(draft.assetCode || 'USDC');
      setMemo(draft.description || '');
      if (draft.dueDate) {
        // Parse due date for terms calculation
        const dueDate = new Date(draft.dueDate);
        const now = new Date();
        const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 7) setTerms('Net 7');
        else if (diffDays === 14) setTerms('Net 14');
        else if (diffDays === 30) setTerms('Net 30');
      }
      // If draft has customer ID, load customer
      if (draft.customerId) {
        // CustomerService.getCustomer(draft.customerId).then(setSelectedCustomer);
      }
    }
  }, [draft]);

  // Handle form field changes with autosave
  const handleFieldChange = (field: string, value: string) => {
    // Update local state
    switch (field) {
      case 'company':
        setCompany(value);
        break;
      case 'amount':
        setAmount(value);
        break;
      case 'currency':
        setCurrency(value);
        break;
      case 'terms':
        setTerms(value);
        break;
      case 'memo':
        setMemo(value);
        break;
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    switch (field) {
      case 'company':
        updates.clientName = value || undefined;
        break;
      case 'amount':
        const parsedAmount = parseFloat(value.replace(/,/g, ''));
        updates.amount = isNaN(parsedAmount) ? undefined : parsedAmount;
        break;
      case 'currency':
        updates.asset_code = value;
        break;
      case 'memo':
        updates.description = value || undefined;
        break;
      case 'terms':
        // Calculate due date based on terms
        const days = parseInt(value.split(' ')[1] || '30');
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + days);
        updates.due_date = dueDate.toISOString();
        break;
    }

    // Trigger autosave
    updateDraft(updates);
  };

  // ─── CustomerPicker handlers ───────────────────────────────────────────────

  const handleCustomerSelect = useCallback(
    (customer: Customer) => {
      setSelectedCustomer(customer);
      setCompany(customer.name);
      const draftUpdate: Record<string, unknown> = {
        clientName: customer.name,
        customer_id: customer.id,
      };
      if (customer.email) draftUpdate['clientEmail'] = customer.email;
      updateDraft(draftUpdate);
    },
    [updateDraft],
  );

  const handleCustomerClear = useCallback(() => {
    setSelectedCustomer(null);
    setCompany('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateDraft({ customer_id: undefined } as any);
  }, [updateDraft]);

  // Offline mutation for creating invoices
  const createInvoiceMutation = useOfflineMutation(
    async (data: unknown) => {
      const response = await axios.post(`${API_URL}/invoices`, data, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    },
    {
      onSuccess: (data) => {
        // Navigate to invoice details on success
        router.push(`/invoices/${data.id}`);
      },
      onError: (error) => {
        // Handle error
        console.error('Invoice creation failed:', error);
        Alert.alert(
          'Error',
          'Failed to create invoice. Please try again.',
          [{ text: 'OK' }],
        );
      },
      onQueue: () => {
        // Show user that the request is queued
        Alert.alert(
          'Request Queued',
          'You are currently offline. Your invoice will be created automatically when you reconnect.',
          [{ text: 'OK' }],
        );
      },
    },
  );

  const confirmInvoice = async () => {
    // Parse amount string (remove commas)
    const parsedAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(
        'Invalid Amount',
        'Please enter a valid positive amount.',
        [{ text: 'OK' }],
      );
      return;
    }

    // Check if draft is complete
    if (!isComplete) {
      Alert.alert(
        'Draft Incomplete',
        'Please fill in all required fields (client name, email, and amount) before creating an invoice.',
        [{ text: 'OK' }],
      );
      return;
    }

    try {
      // First, save all pending changes
      await saveDraft();

      // Convert draft to invoice
      const invoice = await convertToInvoice();

      // Navigate to invoice detail
      router.push(`/invoices/${(invoice as { id: string }).id}`);
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to create invoice',
        [{ text: 'OK' }],
      );
    }
  };

  const handleDiscardDraft = () => {
    Alert.alert(
      'Discard Draft',
      'Are you sure you want to discard this draft?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              await discardDraft();
              router.push('/');
            } catch (err) {
              Alert.alert(
                'Error',
                'Failed to discard draft',
                [{ text: 'OK' }],
              );
            }
          },
        },
      ],
    );
  };

  const isLoading = createInvoiceMutation.isLoading || isSaving || isLoadingDraft;
  const isQueued = createInvoiceMutation.isQueued;

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
          {/* Queued status indicator */}
          {isQueued && (
            <View className="mb-4 rounded-xl bg-blue-500/20 p-4 border border-blue-500/50">
              <Text
                className="text-center text-sm text-blue-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                ⏳ Invoice is queued and will be created when online
              </Text>
            </View>
          )}

          {/* Draft status indicator */}
          <View className="mb-4 flex-row items-center justify-between">
            <Text
              className="text-sm uppercase tracking-[0.35em] text-[#7dd3fc]"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {draft?.id ? 'Resume Draft' : 'New Invoice'}
            </Text>
            <View className="flex-row items-center gap-3">
              {isSaving && (
                <ActivityIndicator size="small" color="#7dd3fc" />
              )}
              {lastSavedAt && !isSaving && (
                <Text
                  className="text-xs text-slate-400"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  Saved {new Date(lastSavedAt).toLocaleTimeString()}
                </Text>
              )}
              {draft && (
                <Text
                  className="text-xs text-slate-400"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {completionPercentage}% complete
                </Text>
              )}
            </View>
          </View>

          {/* Discard button */}
          {draft && (
            <TouchableOpacity
              onPress={handleDiscardDraft}
              className="mb-4 self-end"
            >
              <Text
                className="text-sm text-red-400"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                Discard Draft
              </Text>
            </TouchableOpacity>
          )}

          <Text
            className="mt-2 text-4xl text-white"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            Issue programmable receivables with Base settlement.
          </Text>
          <Text
            className="mt-2 text-base text-slate-300"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            Define counterparties, stablecoin rails, and payment automation in
            one flow.
          </Text>

          {/* Progress bar for draft completion */}
          {draft && (
            <View className="mt-4">
              <View className="flex-row items-center justify-between mb-1">
                <Text
                  className="text-xs text-slate-400"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  Draft progress
                </Text>
                <Text
                  className="text-xs text-slate-400"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {completionPercentage}%
                </Text>
              </View>
              <View className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                <View
                  className="h-full rounded-full bg-[#00D6B9] transition-all duration-300"
                  style={{ width: `${completionPercentage}%` }}
                />
              </View>
            </View>
          )}

          <View className="mt-6 gap-6">
            {/* Customer picker — search, select, or quick-create */}
            {accessToken && (
              <CustomerPicker
                accessToken={accessToken}
                selectedCustomer={selectedCustomer}
                onSelect={handleCustomerSelect}
                onClear={handleCustomerClear}
                onCustomerCreated={handleCustomerSelect}
                disabled={isLoading}
              />
            )}

            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                Counterparty name
              </Text>
              <TextInput
                value={company}
                onChangeText={(text) => handleFieldChange('company', text)}
                placeholder="Vendor or client"
                placeholderTextColor="#475569"
                className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                editable={!isLoading}
              />
            </View>

            <View className="flex-row gap-4">
              <View className="flex-1">
                <Text
                  className="text-sm text-slate-300"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  Amount
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={(text) => handleFieldChange('amount', text)}
                  keyboardType="numeric"
                  className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                  style={{
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    fontSize: 18,
                  }}
                  editable={!isLoading}
                />
              </View>
              <View className="flex-1">
                <Text
                  className="text-sm text-slate-300"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  Currency
                </Text>
                <View className="mt-3 flex-row rounded-2xl border border-white/10 bg-white/5">
                  {currencies.map((option) => (
                    <Pressable
                      key={option}
                      className={`flex-1 items-center justify-center rounded-2xl py-3 ${
                        currency === option ? 'bg-white' : ''
                      }`}
                      onPress={() => {
                        if (!isLoading) handleFieldChange('currency', option);
                      }}
                      disabled={isLoading}
                    >
                      <Text
                        className={`text-base ${currency === option ? 'text-[#050914]' : 'text-white'}`}
                        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                Payment terms
              </Text>
              <View className="mt-3 flex-row rounded-2xl border border-white/10 bg-white/5">
                {paymentTerms.map((option) => (
                  <Pressable
                    key={option}
                    className={`flex-1 items-center justify-center rounded-2xl py-3 ${
                      terms === option ? 'bg-[#2663FF]' : ''
                    }`}
                    onPress={() => {
                      if (!isLoading) handleFieldChange('terms', option);
                    }}
                    disabled={isLoading}
                  >
                    <Text
                      className={`text-base ${terms === option ? 'text-white' : 'text-slate-300'}`}
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                Memo / Scope
              </Text>
              <TextInput
                value={memo}
                onChangeText={(text) => handleFieldChange('memo', text)}
                multiline
                numberOfLines={4}
                className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                placeholder="Describe the services, collateral, or shipment"
                placeholderTextColor="#475569"
                style={{
                  fontFamily: 'SpaceGrotesk_500Medium',
                  textAlignVertical: 'top',
                }}
                editable={!isLoading}
              />
            </View>
          </View>

          <View className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-5">
            <Text
              className="text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              Automated routing
            </Text>
            <Text
              className="mt-3 text-xl text-white"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              80% to operating wallet, 20% to treasury multisig.
            </Text>
            <Text
              className="mt-2 text-sm text-slate-300"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
            >
              Each invoice inherits programmable payout splits and Base proofs
              for counterparty transparency.
            </Text>
            {payoutKey && (
              <View className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <Text
                  className="text-xs text-slate-400"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  Payout destination
                </Text>
                <Text
                  className="mt-1 text-xs text-slate-300"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {payoutKey}
                </Text>
              </View>
            )}
          </View>

          <Pressable
            className={`mt-8 rounded-2xl py-4 shadow-lg shadow-[#00D6B9]/50 ${
              isLoading ? 'bg-[#00D6B9]/50' : 'bg-[#00D6B9]'
            }`}
            onPress={confirmInvoice}
            disabled={isLoading}
          >
            <Text
              className={`text-center text-lg ${
                isLoading ? 'text-[#041125]/50' : 'text-[#041125]'
              }`}
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            >
              {isLoading ? 'Creating...' : 'Mint invoice NFT + share pay link'}
            </Text>
          </Pressable>

          {draftError && (
            <View className="mt-4 rounded-xl bg-amber-500/20 p-4 border border-amber-500/50">
              <Text
                className="text-center text-sm text-amber-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                ⚠️ Autosave temporarily unavailable: {draftError}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}