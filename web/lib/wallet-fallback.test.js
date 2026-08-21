import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaymentSharePayload,
  copyPaymentUri,
  isNativeShareSupported,
  sharePaymentRequest,
} from './wallet-fallback.js';

const PAYMENT_URI =
  'web+stellar:pay?destination=GABCDEF&amount=42.5&asset_code=USDC&memo=123&memo_type=id';

function createNavigator({ share, clipboard } = {}) {
  const nav = {};
  if (share !== undefined) nav.share = share;
  if (clipboard !== undefined) nav.clipboard = clipboard;
  return nav;
}

test('native share support is detected from navigator.share', () => {
  assert.equal(isNativeShareSupported(createNavigator({ share: async () => {} })), true);
  assert.equal(isNativeShareSupported(createNavigator({})), false);
  assert.equal(isNativeShareSupported(undefined), false);
});

test('share payload contains the title, amount and exact payment URI', () => {
  const payload = buildPaymentSharePayload({
    invoiceNumber: 'INV-7',
    amountLabel: '42.5 USDC',
    paymentUri: PAYMENT_URI,
  });

  assert.deepEqual(payload, {
    title: 'Invoice INV-7',
    text: `Amount: 42.5 USDC\nPayment link: ${PAYMENT_URI}`,
  });
});

test('share payload falls back to a generic title without an invoice number', () => {
  const payload = buildPaymentSharePayload({ paymentUri: PAYMENT_URI });
  assert.equal(payload.title, 'Payment request');
  assert.ok(payload.text.includes(PAYMENT_URI));
});

test('share action passes the payment request data to navigator.share', async () => {
  const shared = [];
  const nav = createNavigator({
    share: async (payload) => {
      shared.push(payload);
    },
  });

  const payload = buildPaymentSharePayload({
    invoiceNumber: 'INV-7',
    amountLabel: '42.5 USDC',
    paymentUri: PAYMENT_URI,
  });
  const outcome = await sharePaymentRequest(payload, nav);

  assert.equal(outcome, 'shared');
  assert.deepEqual(shared, [payload]);
});

test('dismissed share dialog is reported without a failure state', async () => {
  const abortError = new Error('User closed the share sheet');
  abortError.name = 'AbortError';
  const nav = createNavigator({ share: async () => Promise.reject(abortError) });

  assert.equal(await sharePaymentRequest({ title: 't', text: 'x' }, nav), 'dismissed');
});

test('share failures are reported instead of thrown', async () => {
  const nav = createNavigator({
    share: async () => Promise.reject(new TypeError('network gone')),
  });

  assert.equal(await sharePaymentRequest({ title: 't', text: 'x' }, nav), 'failed');
});

test('unsupported native sharing never calls navigator.share', async () => {
  let called = false;
  const nav = createNavigator({
    share: async () => {
      called = true;
    },
  });
  Reflect.deleteProperty(nav, 'share');

  assert.equal(await sharePaymentRequest({ title: 't', text: 'x' }, nav), 'unsupported');
  assert.equal(called, false);
});

test('copy writes the exact payment URI to the clipboard', async () => {
  const written = [];
  const nav = createNavigator({
    clipboard: {
      writeText: async (text) => {
        written.push(text);
      },
    },
  });

  assert.equal(await copyPaymentUri(PAYMENT_URI, nav), true);
  assert.deepEqual(written, [PAYMENT_URI]);
});

test('clipboard failures are reported instead of thrown', async () => {
  const nav = createNavigator({
    clipboard: {
      writeText: async () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    },
  });

  assert.equal(await copyPaymentUri(PAYMENT_URI, nav), false);
});

test('missing clipboard keeps the flow alive without copying', async () => {
  assert.equal(await copyPaymentUri(PAYMENT_URI, createNavigator({})), false);
  assert.equal(await copyPaymentUri(PAYMENT_URI, undefined), false);
});
