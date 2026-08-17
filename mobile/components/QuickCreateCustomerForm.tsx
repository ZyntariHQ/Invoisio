/**
 * QuickCreateCustomerForm
 *
 * An inline, keyboard-friendly form that lets a merchant create a new customer
 * profile without leaving the invoice creation flow.
 *
 * Fields:
 *   - Name (required)
 *   - Email (optional, validated)
 *   - Notes (optional, multi-line)
 *
 * On success the caller receives the newly created Customer object.
 */

import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as RNTextInput,
} from 'react-native';

import {
  CustomerService,
  type Customer,
  type CreateCustomerPayload,
} from '../lib/customer-service';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface QuickCreateCustomerFormProps {
  /** JWT token forwarded to CustomerService.create(). */
  accessToken: string;
  /** Pre-fill the name field (e.g. from the search query). */
  initialName?: string;
  /** Called with the newly created Customer on success. */
  onCreated: (customer: Customer) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

// ─── Simple email validator ───────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  if (!value.trim()) return null; // optional field
  return EMAIL_RE.test(value.trim()) ? null : 'Please enter a valid email address.';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickCreateCustomerForm({
  accessToken,
  initialName = '',
  onCreated,
  onCancel,
}: QuickCreateCustomerFormProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailRef = useRef<RNTextInput>(null);
  const notesRef = useRef<RNTextInput>(null);

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    let valid = true;

    if (!name.trim()) {
      setNameError('Client name is required.');
      valid = false;
    } else {
      setNameError(null);
    }

    const emailErr = validateEmail(email);
    setEmailError(emailErr);
    if (emailErr) valid = false;

    return valid;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload: CreateCustomerPayload = {
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const created = await CustomerService.create(accessToken, payload);
      onCreated(created);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create client. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View
      className="mt-3 rounded-2xl border border-[#2663FF]/30 bg-[#2663FF]/5 p-4 gap-4"
      accessibilityLabel="Quick create customer form"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View>
          <Text
            className="text-sm text-[#2663FF]"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            New client
          </Text>
          <Text
            className="text-xs text-slate-500 mt-0.5"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            Saved for future invoices
          </Text>
        </View>
        <Pressable
          onPress={onCancel}
          disabled={isSubmitting}
          className="rounded-full p-2 active:bg-white/10"
          accessibilityRole="button"
          accessibilityLabel="Cancel new client"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            className="text-slate-400 text-sm"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            ✕
          </Text>
        </Pressable>
      </View>

      {/* Submit error */}
      {submitError && (
        <View className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <Text
            className="text-xs text-red-400"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            ⚠ {submitError}
          </Text>
        </View>
      )}

      {/* Name field */}
      <View>
        <Text
          className="mb-1.5 text-xs text-slate-400"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          Name <Text className="text-red-400">*</Text>
        </Text>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (nameError) setNameError(null);
          }}
          placeholder="Client or company name"
          placeholderTextColor="#475569"
          className={`rounded-xl border ${nameError ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 bg-white/5'} px-4 py-3 text-white`}
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          autoCapitalize="words"
          autoComplete="name"
          editable={!isSubmitting}
          accessibilityLabel="Client name"
          accessibilityHint="Required field"
        />
        {nameError && (
          <Text
            className="mt-1 text-xs text-red-400"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {nameError}
          </Text>
        )}
      </View>

      {/* Email field */}
      <View>
        <Text
          className="mb-1.5 text-xs text-slate-400"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          Email{' '}
          <Text
            className="text-slate-600"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            (optional)
          </Text>
        </Text>
        <TextInput
          ref={emailRef}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailError) setEmailError(null);
          }}
          placeholder="client@example.com"
          placeholderTextColor="#475569"
          className={`rounded-xl border ${emailError ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 bg-white/5'} px-4 py-3 text-white`}
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => notesRef.current?.focus()}
          editable={!isSubmitting}
          accessibilityLabel="Client email"
        />
        {emailError && (
          <Text
            className="mt-1 text-xs text-red-400"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {emailError}
          </Text>
        )}
      </View>

      {/* Notes field */}
      <View>
        <Text
          className="mb-1.5 text-xs text-slate-400"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          Notes{' '}
          <Text
            className="text-slate-600"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            (optional)
          </Text>
        </Text>
        <TextInput
          ref={notesRef}
          value={notes}
          onChangeText={setNotes}
          placeholder="Internal reference, billing address, etc."
          placeholderTextColor="#475569"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white"
          style={{
            fontFamily: 'SpaceGrotesk_500Medium',
            textAlignVertical: 'top',
            minHeight: 72,
          }}
          multiline
          numberOfLines={3}
          returnKeyType="done"
          editable={!isSubmitting}
          accessibilityLabel="Client notes"
        />
      </View>

      {/* Action buttons */}
      <View className="flex-row gap-3 mt-1">
        <Pressable
          onPress={onCancel}
          disabled={isSubmitting}
          className="flex-1 rounded-xl border border-white/10 py-3 active:bg-white/5"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text
            className="text-center text-sm text-slate-300"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            void handleSubmit();
          }}
          disabled={isSubmitting}
          className={`flex-1 rounded-xl py-3 ${isSubmitting ? 'bg-[#2663FF]/40' : 'bg-[#2663FF]'} active:bg-[#2663FF]/80`}
          accessibilityRole="button"
          accessibilityLabel={isSubmitting ? 'Saving client' : 'Save client'}
          accessibilityState={{ busy: isSubmitting }}
        >
          {isSubmitting ? (
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text
                className="text-sm text-white"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                Saving…
              </Text>
            </View>
          ) : (
            <Text
              className="text-center text-sm text-white"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              Save client
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
