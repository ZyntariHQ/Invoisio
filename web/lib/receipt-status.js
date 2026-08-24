export function isReceiptEligibleForDisplay(status) {
  return status === 'paid';
}

export function getReceiptStatusLabel(status) {
  if (status === 'paid') return 'Paid';
  if (status === 'pending') return 'Pending';
  if (status === 'overdue') return 'Overdue';
  if (status === 'cancelled') return 'Cancelled';
  return status ?? 'Unknown';
}
