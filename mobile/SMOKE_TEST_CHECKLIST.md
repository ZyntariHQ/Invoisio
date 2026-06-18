# Mobile Smoke Test Checklist

This document defines a lightweight, contributor-friendly manual smoke test for the mobile app. It covers the most important journeys for the current mobile experience and is intended to catch major regressions before opening a PR.

## Scope

Covers the following critical paths:
- Login / authentication flow
- Invoice list view
- Invoice detail view
- Create invoice flow
- Share invoice flow

Supports both Android and iOS expectations for simulators and physical devices.

## Before you start

1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
2. Ensure the backend/API is running and reachable with the correct mobile configuration.
3. Have one or more supported targets ready:
   - Android emulator or Android device
   - iOS simulator or iOS device
4. Start the app on the target platform:
   - Android: `npm run android`
   - iOS: `npm run ios`

## General instructions

- Perform the checklist on both Android and iOS when possible.
- Use the same user/account or test data for each platform to compare results.
- If a step fails, capture the exact screen, error message, and device/emulator details.

## 1. Login / authentication

- [ ] Launch the app and verify the initial landing/welcome screen appears.
- [ ] Sign in using the expected wallet/auth flow.
- [ ] Confirm login completes and the app navigates to the invoice list.
- [ ] Expect no crashes, blank screens, or permanent loading indicators.
- [ ] Android expectation: system back button returns to the previous screen or exits the app cleanly.
- [ ] iOS expectation: navigation gestures and the keyboard behave normally.

## 2. Invoice list

- [ ] Confirm the invoice list loads with invoices or a valid empty state.
- [ ] Verify invoice cards/items show correct summary information (client, amount, due date, status).
- [ ] Tap an invoice to navigate to the invoice detail view.
- [ ] Expect continuous scrolling, refresh behavior, and content rendering to work.

## 3. Invoice detail

- [ ] Verify invoice detail loads for the selected invoice.
- [ ] Confirm all expected fields appear: amount, invoice number, due date, client, description, and payment status.
- [ ] If the invoice is payable, verify the pay action or payment instructions are visible.
- [ ] Tap any detail view actions such as `Refresh`, `Mark Paid`, or `View Payment Status` if available.
- [ ] Confirm that returning to the list works as expected.

## 4. Create invoice flow

- [ ] Start the create invoice flow from the invoice list or action button.
- [ ] Fill in required fields and submit the new invoice.
- [ ] Confirm validation errors display correctly if required fields are missing.
- [ ] Expect the invoice to save successfully and the app to return to the invoice list or detail page.
- [ ] Verify the new invoice is visible in the invoice list after creation.
- [ ] Android expectation: input fields remain visible when the keyboard appears.
- [ ] iOS expectation: forms scroll correctly and the keyboard does not cover submit controls.

## 5. Share invoice flow

- [ ] Open an invoice detail and trigger the share action.
- [ ] Confirm the native share sheet appears on Android or iOS.
- [ ] Verify share content includes the invoice link, ID, or details required to share the invoice.
- [ ] Choose a target share channel and confirm the system returns to the app afterward.
- [ ] If copy-to-clipboard is available, verify the copied content is correct.

## Platform-specific expectations

### Android
- [ ] Android share sheet appears and is usable.
- [ ] Hardware/back button behavior is correct in each flow.
- [ ] No platform-specific UI clipping or input issues exist.

### iOS
- [ ] iOS share sheet appears and is usable.
- [ ] Swipe gestures and native navigation behave correctly.
- [ ] The on-screen keyboard does not hide important fields.

## PR readiness checklist

Before opening a PR, confirm:
- [ ] All smoke test items were completed on at least one platform.
- [ ] Android and iOS platform expectations were validated when available.
- [ ] Any regressions were documented with screenshots and device/emulator details.
- [ ] The checklist covers login, invoice list, invoice detail, create flow, and share flow.

## Notes

- This document is intended as a quick manual gating checklist, not a replacement for automated tests.
- Use this checklist to catch high-risk regressions before code review.
