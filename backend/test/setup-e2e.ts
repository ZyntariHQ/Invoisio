// Ensure the app's boot-time validation passes during e2e tests by providing
// a JWT_SECRET of at least 32 characters. This keeps the CI workflow untouched.
const existing = process.env.JWT_SECRET;
process.env.JWT_SECRET =
  existing && existing.length >= 32
    ? existing
    : "e2e-test-secret-please-change-0123456789";
