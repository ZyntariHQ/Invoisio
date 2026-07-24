## Summary
Adds merchant profile setup support so campaign contributors can work against realistic merchant account data.

## Related Issue(s)
Closes #157

## Type of Change
- [x] Feature
- [ ] Fix
- [ ] Refactor
- [ ] Documentation
- [ ] Chore

## Description
- Added authenticated merchant profile endpoints:
  - `GET /merchant/profile`
  - `PUT /merchant/profile`
  - `PATCH /merchant/profile`
- Added merchant profile fields for `businessEmail`, `preferredAsset`, and `payoutWallet`.
- Added Prisma migration for the new merchant profile fields.
- Validates payout wallets as Stellar public keys before saving.
- Added focused service tests for profile retrieval, updates, and invalid Stellar key rejection.

## Testing Evidence
Tested with:

```bash
npm test -- --runInBand
npm run build
```

Results:
- 12 test suites passed
- 56 tests passed
- Backend build completed successfully

## Screenshots
N/A. No UI changes.

## Checklist
- [x] Code builds successfully
- [x] Tests added/updated where applicable
- [x] Documentation updated if needed
- [x] Linked issue referenced
- [x] Ready for review
