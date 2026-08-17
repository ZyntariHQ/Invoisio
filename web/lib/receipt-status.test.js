import test from 'node:test';
import assert from 'node:assert/strict';
import { getReceiptStatusLabel, isReceiptEligibleForDisplay } from './receipt-status.js';

test('paid invoices are eligible for receipt display', () => {
  assert.equal(isReceiptEligibleForDisplay('paid'), true);
  assert.equal(getReceiptStatusLabel('paid'), 'Paid');
});

test('unpaid invoices are not eligible for receipt display', () => {
  assert.equal(isReceiptEligibleForDisplay('pending'), false);
  assert.equal(isReceiptEligibleForDisplay('overdue'), false);
  assert.equal(isReceiptEligibleForDisplay('cancelled'), false);
  assert.equal(isReceiptEligibleForDisplay(undefined), false);
  assert.equal(getReceiptStatusLabel('pending'), 'Pending');
  assert.equal(getReceiptStatusLabel(undefined), 'Unknown');
});
