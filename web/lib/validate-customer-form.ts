import type { CreateCustomerPayload } from "./customer-service";

export interface CustomerFormErrors {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface CustomerFormTouched {
  name: boolean;
  phone: boolean;
  email: boolean;
  notes: boolean;
}

export const initialCustomerFormTouched: CustomerFormTouched = {
  name: false,
  phone: false,
  email: false,
  notes: false,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s\-\+\(\)\.]{6,30}$/;
const PHONE_DIGITS_MIN = 6;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!PHONE_REGEX.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= PHONE_DIGITS_MIN;
}

export function validateCustomerForm(
  values: Partial<CreateCustomerPayload> & { name: string },
): CustomerFormErrors {
  const errors: CustomerFormErrors = {};

  const nameTrimmed = values.name?.trim() ?? "";
  if (!nameTrimmed) {
    errors.name = "Customer name is required";
  } else if (nameTrimmed.length > 200) {
    errors.name = "Customer name cannot exceed 200 characters";
  }

  if (values.phone !== undefined && values.phone.trim() !== "") {
    const phoneTrimmed = values.phone.trim();
    const digits = phoneTrimmed.replace(/\D/g, "");
    if (digits.length < PHONE_DIGITS_MIN) {
      errors.phone = `Phone number must contain at least ${PHONE_DIGITS_MIN} digits`;
    } else if (phoneTrimmed.length > 30) {
      errors.phone = "Phone number cannot exceed 30 characters";
    } else if (!/^[\d\s\-\+\(\)\.]+$/.test(phoneTrimmed)) {
      errors.phone = "Invalid phone number format";
    }
  }

  if (values.email !== undefined && values.email.trim() !== "") {
    const emailTrimmed = values.email.trim();
    if (!isValidEmail(emailTrimmed)) {
      errors.email = "Invalid email address";
    }
  }

  if (values.notes !== undefined && values.notes.trim() !== "") {
    if (values.notes.length > 1000) {
      errors.notes = "Notes cannot exceed 1000 characters";
    }
  }

  return errors;
}

export function hasErrors(errors: CustomerFormErrors): boolean {
  return Object.keys(errors).some((k) => Boolean((errors as Record<string, unknown>)[k]));
}

export function getVisibleErrors(
  errors: CustomerFormErrors,
  touched: CustomerFormTouched,
): CustomerFormErrors {
  const visible: CustomerFormErrors = {};
  if (touched.name && errors.name) visible.name = errors.name;
  if (touched.phone && errors.phone) visible.phone = errors.phone;
  if (touched.email && errors.email) visible.email = errors.email;
  if (touched.notes && errors.notes) visible.notes = errors.notes;
  return visible;
}

export function detectDuplicateCandidates(
  existing: Array<{ id: string; name: string; phone: string | null; email: string | null }>,
  draft: { name: string; phone?: string; email?: string },
): Array<{ id: string; name: string; phone: string | null; email: string | null; matchReason: string }> {
  const matches: Array<{ id: string; name: string; phone: string | null; email: string | null; matchReason: string }> = [];
  const seenIds = new Set<string>();

  const draftName = draft.name.trim().toLowerCase();
  const draftPhoneDigits = draft.phone?.trim().replace(/\D/g, "") ?? "";
  const draftEmail = draft.email?.trim().toLowerCase() ?? "";

  for (const c of existing) {
    if (seenIds.has(c.id)) continue;

    let reason: string | null = null;

    const cName = c.name.trim().toLowerCase();
    if (draftName.length >= 2 && (cName.includes(draftName) || draftName.includes(cName))) {
      reason = "Similar name";
    }

    const cPhoneDigits = c.phone?.trim().replace(/\D/g, "") ?? "";
    if (!reason && draftPhoneDigits.length >= PHONE_DIGITS_MIN && cPhoneDigits.length >= PHONE_DIGITS_MIN) {
      if (cPhoneDigits.includes(draftPhoneDigits) || draftPhoneDigits.includes(cPhoneDigits)) {
        reason = "Similar phone number";
      }
    }

    if (!reason && draftEmail && c.email?.trim().toLowerCase() === draftEmail) {
      reason = "Matching email";
    }

    if (reason) {
      seenIds.add(c.id);
      matches.push({ ...c, matchReason: reason });
    }
  }

  return matches;
}
