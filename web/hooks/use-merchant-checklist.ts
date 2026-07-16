'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MerchantService,
  type ChecklistStepPatch,
  type MerchantActivationChecklist,
} from '@/lib/merchant-service';
import { extractApiErrorMessage } from '@/lib/api-client';

export const checklistQueryKey = ['merchant', 'activation-checklist'] as const;

interface ChecklistStepMeta {
  key: keyof Pick<
    MerchantActivationChecklist,
    | 'profileCompleted'
    | 'payoutKeyCompleted'
    | 'assetPreferenceCompleted'
    | 'firstInvoiceCompleted'
  >;
  title: string;
  description: string;
  cta: string;
  href: string;
}

export const CHECKLIST_STEPS: ChecklistStepMeta[] = [
  {
    key: 'profileCompleted',
    title: 'Complete your merchant profile',
    description:
      'Set your business name so invoices and receipts show your brand.',
    cta: 'Set up profile',
    href: '/onboarding/profile',
  },
  {
    key: 'payoutKeyCompleted',
    title: 'Add your payout key',
    description:
      'Provide a Stellar payout public key to receive settlement funds.',
    cta: 'Add payout key',
    href: '/onboarding/payout',
  },
  {
    key: 'assetPreferenceCompleted',
    title: 'Choose a default asset',
    description:
      'Pick the asset (USDC, EURC, XLM, USD) you prefer to get paid in.',
    cta: 'Pick asset',
    href: '/onboarding/asset',
  },
  {
    key: 'firstInvoiceCompleted',
    title: 'Create your first invoice',
    description:
      'Generate an invoice and share the payment link with your client.',
    cta: 'Create invoice',
    href: '/pos',
  },
];

export function useMerchantChecklist() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: checklistQueryKey,
    queryFn: () => MerchantService.getChecklist(),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: ChecklistStepPatch) =>
      MerchantService.updateChecklist(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(checklistQueryKey, updated);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => MerchantService.syncChecklist(),
    onSuccess: (updated) => {
      queryClient.setQueryData(checklistQueryKey, updated);
    },
  });

  type ChecklistStepKey = (typeof CHECKLIST_STEPS)[number]['key'];

  const setStepComplete = useCallback(
    (key: ChecklistStepKey, value = true) => {
      updateMutation.mutate({ [key]: value } as ChecklistStepPatch);
    },
    [updateMutation],
  );

  const syncChecklist = useCallback(() => {
    syncMutation.mutate();
  }, [syncMutation]);

  const completedCount = data
    ? CHECKLIST_STEPS.filter((step) => data[step.key]).length
    : 0;

  const totalSteps = CHECKLIST_STEPS.length;
  const progress = totalSteps === 0 ? 0 : Math.round((completedCount / totalSteps) * 100);
  const isCompleted = data?.isCompleted ?? false;

  return {
    checklist: data,
    isLoading,
    isError,
    error: isError ? extractApiErrorMessage(error) : null,
    refetch,
    setStepComplete,
    syncChecklist,
    isSyncing: syncMutation.isPending,
    isUpdating: updateMutation.isPending,
    completedCount,
    totalSteps,
    progress,
    isCompleted,
  };
}
