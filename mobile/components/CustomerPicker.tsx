/**
 * CustomerPicker
 *
 * A mobile-optimised customer search + selection widget for the invoice
 * creation flow.  Supports:
 *   - Debounced search against the backend
 *   - Full loading, empty, and error states
 *   - Displaying the selected customer with a clear action
 *   - An "Add new customer" prompt that surfaces the QuickCreateCustomerForm
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CustomerService, type Customer } from '../lib/customer-service';
import { QuickCreateCustomerForm } from './QuickCreateCustomerForm';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CustomerPickerProps {
  /** JWT token forwarded to CustomerService. */
  accessToken: string;
  /** Currently selected customer (controlled). */
  selectedCustomer: Customer | null;
  /** Called when the user picks a customer from the list. */
  onSelect: (customer: Customer) => void;
  /** Called when the user clears the current selection. */
  onClear: () => void;
  /** Called after a brand-new customer is created inline. */
  onCustomerCreated?: (customer: Customer) => void;
  /** Disable interactions while the parent is loading / submitting. */
  disabled?: boolean;
}

// ─── Search result list item ──────────────────────────────────────────────────

interface ResultItemProps {
  customer: Customer;
  onPress: (customer: Customer) => void;
  isLast: boolean;
}

function ResultItem({ customer, onPress, isLast }: ResultItemProps) {
  return (
    <Pressable
      className={`px-4 py-3 active:bg-white/5 ${isLast ? '' : 'border-b border-white/5'}`}
      onPress={() => onPress(customer)}
      accessibilityRole="button"
      accessibilityLabel={`Select ${customer.name}`}
    >
      <Text
        className="text-sm text-white"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        {customer.name}
      </Text>
      {customer.email ? (
        <Text
          className="mt-0.5 text-xs text-slate-400"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
        >
          {customer.email}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CustomerPicker({
  accessToken,
  selectedCustomer,
  onSelect,
  onClear,
  onCustomerCreated,
  disabled = false,
}: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Run search whenever the query changes (debounced 300 ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setShowResults(false);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const data = await CustomerService.search(accessToken, trimmed, 8);
          setResults(data);
          setShowResults(true);
        } catch {
          setSearchError('Could not load customers. Please try again.');
          setResults([]);
          setShowResults(false);
        } finally {
          setIsSearching(false);
        }
      })();
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, accessToken]);

  const handleSelect = useCallback(
    (customer: Customer) => {
      onSelect(customer);
      setQuery('');
      setResults([]);
      setShowResults(false);
      setShowCreateForm(false);
    },
    [onSelect],
  );

  const handleClear = useCallback(() => {
    onClear();
    setQuery('');
    setResults([]);
    setShowResults(false);
    setShowCreateForm(false);
  }, [onClear]);

  const handleCustomerCreated = useCallback(
    (customer: Customer) => {
      handleSelect(customer);
      onCustomerCreated?.(customer);
    },
    [handleSelect, onCustomerCreated],
  );

  const isEmpty = !isSearching && showResults && results.length === 0;
  const showDropdown = showResults || isSearching || isEmpty;

  // ── Selected state ──────────────────────────────────────────────────────────
  if (selectedCustomer) {
    return (
      <View>
        <Text
          className="mb-2 text-sm text-slate-300"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          Saved client
        </Text>

        <View
          className="flex-row items-center justify-between rounded-2xl border border-[#00D6B9]/40 bg-[#00D6B9]/10 px-4 py-4"
          accessibilityLabel={`Selected customer: ${selectedCustomer.name}`}
        >
          <View className="flex-1 mr-3">
            {/* Name + verified badge */}
            <View className="flex-row items-center gap-2">
              <Text
                className="text-sm text-[#00D6B9]"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                numberOfLines={1}
              >
                {selectedCustomer.name}
              </Text>
              <View className="rounded-full bg-[#00D6B9]/20 px-2 py-0.5">
                <Text
                  className="text-[10px] text-[#00D6B9]"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  saved
                </Text>
              </View>
            </View>

            {selectedCustomer.email ? (
              <Text
                className="mt-0.5 text-xs text-slate-400"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                numberOfLines={1}
              >
                {selectedCustomer.email}
              </Text>
            ) : null}

            {selectedCustomer.notes ? (
              <Text
                className="mt-1 text-xs text-slate-500"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                numberOfLines={1}
              >
                {selectedCustomer.notes}
              </Text>
            ) : null}
          </View>

          {!disabled && (
            <Pressable
              onPress={handleClear}
              className="rounded-full p-2 active:bg-white/10"
              accessibilityRole="button"
              accessibilityLabel="Clear selected customer"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text
                className="text-slate-400 text-base"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                ✕
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ── Search / create state ───────────────────────────────────────────────────
  return (
    <View>
      <Text
        className="mb-2 text-sm text-slate-300"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        Saved client
      </Text>

      {/* Search input */}
      <View className="relative">
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            // If user edits after an error, reset it
            if (searchError) setSearchError(null);
          }}
          placeholder="Search saved clients…"
          placeholderTextColor="#475569"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white pr-12"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          autoComplete="off"
          autoCorrect={false}
          editable={!disabled}
          returnKeyType="search"
          accessibilityLabel="Search customers"
          accessibilityHint="Type to search for a saved client"
        />
        {/* Inline loading spinner */}
        {isSearching && (
          <View className="absolute right-4 top-0 bottom-0 justify-center">
            <ActivityIndicator size="small" color="#00D6B9" />
          </View>
        )}
      </View>

      {/* Error banner */}
      {searchError && (
        <View className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <Text
            className="text-xs text-red-400"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            ⚠ {searchError}
          </Text>
        </View>
      )}

      {/* Results dropdown */}
      {showDropdown && !searchError && (
        <View className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1525]">
          {/* Loading skeleton */}
          {isSearching && (
            <View className="flex-row items-center gap-3 px-4 py-3">
              <ActivityIndicator size="small" color="#00D6B9" />
              <Text
                className="text-sm text-slate-400"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                Searching…
              </Text>
            </View>
          )}

          {/* Results list */}
          {!isSearching && results.length > 0 && (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              nestedScrollEnabled
              style={{ maxHeight: 224 }}
              renderItem={({ item, index }) => (
                <ResultItem
                  customer={item}
                  onPress={handleSelect}
                  isLast={index === results.length - 1}
                />
              )}
            />
          )}

          {/* Empty state */}
          {isEmpty && (
            <View className="px-4 py-4">
              <Text
                className="text-sm text-slate-400"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                No clients found for "{query.trim()}"
              </Text>
              <Text
                className="mt-1 text-xs text-slate-500"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                You can create this client below and it will be saved for future
                invoices.
              </Text>
            </View>
          )}

          {/* Add new customer CTA — shown when there are results OR empty */}
          {!isSearching && (showResults || isEmpty) && (
            <Pressable
              className="flex-row items-center gap-2 border-t border-white/5 px-4 py-3 active:bg-white/5"
              onPress={() => setShowCreateForm((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Add new customer"
            >
              <View className="h-5 w-5 items-center justify-center rounded-full bg-[#2663FF]/30">
                <Text
                  className="text-xs text-[#2663FF]"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
                >
                  +
                </Text>
              </View>
              <Text
                className="text-sm text-[#2663FF]"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {showCreateForm ? 'Cancel' : 'Add new client'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* "Add new client" shortcut when the field is empty */}
      {!query.trim() && !showDropdown && (
        <Pressable
          className="mt-2 flex-row items-center gap-2 self-start"
          onPress={() => setShowCreateForm((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Add new customer"
        >
          <View className="h-5 w-5 items-center justify-center rounded-full bg-[#2663FF]/20">
            <Text
              className="text-xs text-[#2663FF]"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            >
              +
            </Text>
          </View>
          <Text
            className="text-sm text-[#2663FF]"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {showCreateForm ? 'Cancel' : 'Add new client'}
          </Text>
        </Pressable>
      )}

      {/* Inline quick-create form */}
      {showCreateForm && (
        <QuickCreateCustomerForm
          accessToken={accessToken}
          initialName={query.trim()}
          onCreated={handleCustomerCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}
    </View>
  );
}
