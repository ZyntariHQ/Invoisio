import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { API_URL } from '@env';
import { useAuthStore } from '../hooks/use-auth-store';
import { useDraftAutosave } from '../hooks/use-draft-autosave';
import { useOfflineMutation } from '../hooks/use-offline-mutation';
import { MerchantService } from '../lib/merchant-service';
import { CustomerService, type Customer } from '../lib/customer-service';
import type { UpdateDraftDto } from '../types/draft.types';

const currencies = ['USDC', 'EURC', 'USD'];
const paymentTerms = ['Net 7', 'Net 14', 'Net 30'];

interface SavedCustomer {
  id: string;
  name: string;
  email?: string;
}

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const { accessToken } = useAuthStore();

  const draftId =
    typeof localSearchParams['draftId'] === 'string'
      ? localSearchParams['draftId']
      : undefined;

  const [company, setCompany] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDC');
  const [terms, setTerms] = useState('Net 14');
  const [memo, setMemo] = useState('');
  const [payoutKey, setPayoutKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    const term = pickerQuery.trim().toLowerCase();
    if (!term) return savedCustomers;

    return savedCustomers.filter((customer) => {
      const combined = `${customer.name} ${customer.email ?? ""}`.toLowerCase();
      return combined.includes(term);
    });
  }, [pickerQuery, savedCustomers]);

  const loadSavedCustomers = async () => {
    if (!accessToken) {
      setSavedCustomers([]);
      setCustomerError("Sign in to reuse your merchant’s saved customers.");
      return;
    }

    setIsLoadingCustomers(true);
    setCustomerError(null);

    try {
      const response = await axios.get(`${API_URL}/invoices?limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const rawItems = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.items)
          ? response.data.items
          : [];

      const customers = new Map<string, SavedCustomer>();

      for (const item of rawItems) {
        const name = typeof item?.clientName === "string" ? item.clientName.trim() : "";
        const email = typeof item?.clientEmail === "string" ? item.clientEmail.trim() : "";
        if (!name) continue;

        const key = `${name.toLowerCase()}::${email.toLowerCase()}`;
        if (!customers.has(key)) {
          customers.set(key, { id: key, name, ...(email ? { email } : {}) });
        }
      }

      setSavedCustomers(Array.from(customers.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Failed to load saved customers:", error);
      setSavedCustomers([]);
      setCustomerError("Couldn’t load saved customers. Try again or create a new one.");
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  // Customer search state
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCustomerSearch = (query: string) => {
    setCustomerQuery(query);
    if (!accessToken) {
      setCustomerResults([]);
      setShowCustomerResults(false);
      return;
    }

    const normalized = query.trim();
    if (!normalized) {
      setCustomerResults([]);
      setShowCustomerResults(false);
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await CustomerService.search(accessToken, normalized, 8);
        setCustomerResults(results);
        setShowCustomerResults(results.length > 0);
      } catch (error) {
        console.error('Failed to search customers:', error);
        setCustomerResults([]);
        setShowCustomerResults(false);
      }
    }, 250);
  };

  const chooseCustomer = (customer: SavedCustomer | Customer) => {
    const normalizedCustomer: Customer = {
      id: customer.id,
      merchantId: '',
      name: customer.name,
      email: 'email' in customer ? customer.email : customer.email ?? null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSelectedCustomer(normalizedCustomer);
    setCustomerQuery(`${customer.name}${customer.email ? ` (${customer.email})` : ''}`);
    setCompany(customer.name);
    setCustomerEmail(customer.email ?? '');
    setShowCustomerResults(false);
    updateDraft({
      clientName: customer.name,
      clientEmail: customer.email || undefined,
      customer_id: customer.id,
    } as UpdateDraftDto);
  };

  const createCustomerFromPicker = () => {
    const name = pickerQuery.trim();
    if (!name) {
      setCompany('');
      setCustomerEmail('');
      setShowCustomerResults(false);
      setPickerOpen(false);
      return;
    }

    const candidate: SavedCustomer = { id: `picker-${name.toLowerCase()}`, name };
    if (customerEmail.trim()) {
      candidate.email = customerEmail.trim();
    }

    chooseCustomer(candidate);
    setPickerOpen(false);
    setPickerQuery('');
  };

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
  } = useDraftAutosave(draftId, {
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

  useEffect(() => {
    if (draft) {
      setCompany(draft.clientName || '');
      setCustomerEmail(draft.clientEmail || '');
      setAmount(draft.amount ? String(draft.amount) : '');
      setCurrency(draft.assetCode || 'USDC');
      setMemo(draft.description || '');

      if (draft.dueDate) {
        const dueDate = new Date(draft.dueDate);
        const now = new Date();
        const diffDays = Math.ceil(
          (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 7) setTerms('Net 7');
        else if (diffDays === 14) setTerms('Net 14');
        else if (diffDays === 30) setTerms('Net 30');
      }
    }
  }, [draft]);

  useEffect(() => {
    if (pickerOpen) {
      void loadSavedCustomers();
    }
  }, [pickerOpen, accessToken]);

  const handleFieldChange = (field: string, value: string) => {
    switch (field) {
      case 'company':
        setCompany(value);
        break;
      case 'customerEmail':
        setCustomerEmail(value);
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
      default:
        break;
    }

    const updates: Partial<UpdateDraftDto> = {};
    switch (field) {
      case 'company':
        updates.clientName = value || undefined;
        break;
      case 'customerEmail':
        updates.clientEmail = value || undefined;
        break;
      case 'amount': {
        const parsedAmount = Number.parseFloat(value.replace(/,/g, ''));
        updates.amount = Number.isNaN(parsedAmount) ? undefined : parsedAmount;
        break;
      }
      case 'currency':
        updates.asset_code = value;
        break;
      case 'memo':
        updates.description = value || undefined;
        break;
      case 'terms': {
        const days = Number.parseInt(value.split(' ')[1] || '30', 10);
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + days);
        updates.due_date = dueDate.toISOString();
        break;
      }
      default:
        break;
    }

    updateDraft(updates as UpdateDraftDto);
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCompany(customer.name);
    setCustomerEmail(customer.email ?? '');
    setCustomerQuery(`${customer.name}${customer.email ? ` (${customer.email})` : ''}`);
    setShowCustomerResults(false);

    updateDraft({
      clientName: customer.name,
      clientEmail: customer.email || undefined,
      customer_id: customer.id,
    } as UpdateDraftDto);
  };

  const clearSelectedCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery('');
    setCompany('');
    setCustomerEmail('');
    updateDraft({
      customer_id: undefined,
    } as UpdateDraftDto);
  };

  const createInvoiceMutation = useOfflineMutation(
    async (data: unknown) => {
      if (!accessToken) {
        throw new Error('Authentication required');
      }

      const response = await axios.post(`${API_URL}/invoices`, data, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data as { id: string };
    },
    {
      descriptor: {
        url: `${API_URL}/invoices`,
        method: 'POST',
        headers: () => ({
          Authorization: accessToken ? `Bearer ${accessToken}` : '',
        }),
        tag: 'create-invoice',
      },
      onSuccess: (data) => {
        router.push(`/invoices/${data.id}`);
      },
      onError: (error) => {
        console.error('Invoice creation failed:', error);
        Alert.alert(
          'Error',
          'Failed to create invoice. Please try again.',
          [{ text: 'OK' }],
        );
      },
      onQueue: () => {
        Alert.alert(
          'Request Queued',
          'You are currently offline. Your invoice will be created automatically when you reconnect.',
          [{ text: 'OK' }],
        );
      },
    },
  );

  const confirmInvoice = async () => {
    const parsedAmount = Number.parseFloat(amount.replace(/,/g, ''));

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(
        'Invalid Amount',
        'Please enter a valid positive amount.',
        [{ text: 'OK' }],
      );
      return;
    }

    if (!company.trim() || !customerEmail.trim()) {
      Alert.alert(
        'Missing client details',
        'Please provide a client name and email before creating the invoice.',
        [{ text: 'OK' }],
      );
      return;
    }

    if (!isComplete) {
      Alert.alert(
        'Draft Incomplete',
        'Please fill in all required fields (client name, email, and amount) before creating an invoice.',
        [{ text: 'OK' }],
      );
      return;
    }

    try {
      await saveDraft();
      const invoice = await convertToInvoice();
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
                err instanceof Error ? err.message : 'Failed to discard draft',
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
            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                Saved client
              </Text>
              <TextInput
                value={customerQuery}
                onChangeText={(text: string) => {
                  handleCustomerSearch(text);
                  if (selectedCustomer) {
                    setSelectedCustomer(null);
                  }
                }}
                placeholder="Search saved clients..."
                placeholderTextColor="#475569"
                className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                autoComplete="off"
                editable={!isLoading}
              />
              {selectedCustomer && (
                <View className="mt-2 flex-row items-center justify-between rounded-xl border border-[#00D6B9]/30 bg-[#00D6B9]/10 px-4 py-2">
                  <View>
                    <Text
                      className="text-sm text-[#00D6B9]"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                    >
                      {selectedCustomer.name}
                    </Text>
                    {selectedCustomer.email && (
                      <Text
                        className="text-xs text-slate-400"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                      >
                        {selectedCustomer.email}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={clearSelectedCustomer}>
                    <Text className="text-sm text-slate-400">✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {showCustomerResults && customerResults.length > 0 && (
                <View className="mt-2 rounded-2xl border border-white/10 bg-[#0d1525]">
                  <FlatList
                    data={customerResults}
                    keyExtractor={(item: Customer) => item.id}
                    nestedScrollEnabled
                    style={{ maxHeight: 200 }}
                    renderItem={({ item }: { item: Customer }) => (
                      <Pressable
                        className="border-b border-white/5 px-4 py-3"
                        onPress={() => {
                          selectCustomer(item);
                        }}
                      >
                        <Text
                          className="text-sm text-white"
                          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                        >
                          {item.name}
                        </Text>
                        {item.email && (
                          <Text
                            className="text-xs text-slate-400"
                            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                          >
                            {item.email}
                          </Text>
                        )}
                      </Pressable>
                    )}
                  />
                </View>
              )}
            </View>

            <View>
              <View className="mb-3 flex-row items-center justify-between">
                <Text
                  className="text-sm text-slate-300"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  Counterparty name
                </Text>
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  className="rounded-full border border-[#7dd3fc]/40 bg-[#7dd3fc]/10 px-3 py-1.5"
                >
                  <Text
                    className="text-xs text-[#7dd3fc]"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                  >
                    Saved customers
                  </Text>
                </Pressable>
              </View>

              <TextInput
                value={company}
                onChangeText={(text) => handleFieldChange('company', text)}
                placeholder="Vendor or client"
                placeholderTextColor="#475569"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                editable={!isLoading}
              />
            </View>

            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                Client email
              </Text>
              <TextInput
                value={customerEmail}
                onChangeText={(text) => handleFieldChange('customerEmail', text)}
                placeholder="billing@company.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
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

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setPickerOpen(false);
          setPickerQuery("");
        }}
      >
        <View className="flex-1 justify-end bg-[#020817]/70">
          <View className="rounded-t-[28px] border border-white/10 bg-[#0B1220] p-5">
            <View className="mb-4 flex-row items-center justify-between">
              <Text
                className="text-lg text-white"
                style={{ fontFamily: "SpaceGrotesk_700Bold" }}
              >
                Select customer
              </Text>
              <Pressable onPress={() => setPickerOpen(false)}>
                <Text
                  className="text-base text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Close
                </Text>
              </Pressable>
            </View>

            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search saved customers"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            />

            {customerError ? (
              <Text
                className="mt-3 text-sm text-red-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                {customerError}
              </Text>
            ) : null}

            {isLoadingCustomers ? (
              <View className="mt-5 items-center py-5">
                <ActivityIndicator color="#7dd3fc" />
                <Text
                  className="mt-3 text-sm text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Loading saved customers...
                </Text>
              </View>
            ) : filteredCustomers.length > 0 ? (
              <ScrollView className="mt-4 max-h-72" showsVerticalScrollIndicator={false}>
                {filteredCustomers.map((customer) => (
                  <Pressable
                    key={customer.id}
                    onPress={() => chooseCustomer(customer)}
                    className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <Text
                      className="text-base text-white"
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {customer.name}
                    </Text>
                    {customer.email ? (
                      <Text
                        className="mt-1 text-xs text-slate-300"
                        style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                      >
                        {customer.email}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 p-4">
                <Text
                  className="text-sm text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  No saved customers match this search.
                </Text>
                <Text
                  className="mt-2 text-xs text-slate-400"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  Create a new customer inline without leaving the invoice flow.
                </Text>
              </View>
            )}

            <Pressable
              onPress={createCustomerFromPicker}
              className="mt-5 rounded-2xl bg-[#2663FF] px-4 py-3"
            >
              <Text
                className="text-center text-base text-white"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                {pickerQuery.trim()
                  ? `Use "${pickerQuery.trim()}" as customer`
                  : "Use current customer details"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}