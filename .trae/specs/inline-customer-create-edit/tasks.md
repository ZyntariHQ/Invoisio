# Inline Customer Quick-Create & Edit - Implementation Plan

## Task 1: Extract & enhance reusable CustomerQuickSelect component
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create new file `web/components/CustomerQuickSelect.tsx`
  - Move the search/select logic from `CustomerAutocomplete` (invoice new) into the shared component
  - Include inline quick-create form (name/email/notes) inside the component (reuse existing styling from invoice new)
  - Add inline edit form: when a customer is selected, expose an "Edit" button/link next to the selected-customer info badge that expands an edit form pre-filled with the customer's name/email/notes
  - Add client-side validation: name required (inline message, ring-red), email `IsEmail`-style format check, notes <= 1000 chars
  - Add duplicate-hint UX: on create form, when user types email that matches an existing search result or returns 409 on submit, show actionable suggestion banner with "Use existing client" that auto-selects
  - Add loading states for create/edit submit (button disabled, "Creating…"/"Saving…" text)
  - Add success feedback: brief inline banner (2-3s) showing "Client saved ✓" after create/edit
  - Props: `value?: Customer | null`, `onCustomerSelect: (c: Customer | null) => void`, optional `label`/`placeholder` overrides for POS vs invoice
  - Ensure cancel/close does not call `onCustomerSelect(null)`, preserving existing selection
  - Use `lucide-react` icons (Pencil, CheckCircle2, X, UserPlus) matching `/customers` page style
  - Expose aria attributes (aria-invalid, aria-describedby for errors, aria-busy while loading)
  - Keyboard: Esc closes create/edit form without submitting
  - Do NOT alter customer-service or backend API in this task
- **Acceptance Criteria Addressed**: AC-9 (shared), AC-8 (success feedback), AC-5 (validation), AC-7 (duplicate on edit), AC-10 (state isolation)
- **Test Requirements**:
  - `rule` TR-1.1: Component file exists at `web/components/CustomerQuickSelect.tsx`; `grep -c "CustomerQuickSelect" web/app/invoices/new/page.tsx web/app/pos/page.tsx` shows 2 imports after Task 2/3
  - `rule` TR-1.2: Name-required validation fires without network — fill empty name submit → no POST in Network tab, inline error visible, `aria-invalid="true"` on name input
  - `rule` TR-1.3: Invalid email format blocks submit (inline "Invalid email address" shown), no network call
  - `rule` TR-1.4: Esc key closes open create/edit form, selected customer unchanged, parent form fields intact (test manually + verify)
  - `rubric` TR-1.5: Component API clarity; scale 1-5; 1 = props/state confusing & duplicated; 3 = works but awkward API; 5 = clean props (value/onChange pattern) and < 500 lines total; threshold >= 4; evidence = file content + line count
- **Notes**: Keep component self-contained. Match the existing blue-50/blue-200 rounded card style from invoice new's inline create form.

## Task 2: Integrate CustomerQuickSelect into invoice-new form
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - In `web/app/invoices/new/page.tsx`, delete the local `CustomerAutocomplete` function (lines 23–328 approx)
  - Import and render `<CustomerQuickSelect />` in its place at line ~642
  - Wire `value={selectedCustomer}` and `onCustomerSelect={handleCustomerSelect}` — same signature as existing
  - Verify the existing draft autosave path: `handleCustomerSelect` still updates `clientName`/`clientEmail`/`customer_id` draft fields (keep existing handler, it is correct)
  - Verify the standalone client-name/email fields (shown only when NO customer selected) still render and work unchanged — preserve the fallback `<>` block lines 648–685
  - Check no imports are left dangling; clean up
- **Acceptance Criteria Addressed**: AC-1 (create in invoice), AC-3 (edit in invoice), AC-10 (state isolation), AC-6 (409 handling in invoice)
- **Test Requirements**:
  - `rule` TR-2.1: `CustomerAutocomplete` symbol no longer defined in page; TS build succeeds with `CustomerQuickSelect` import only
  - `rule` TR-2.2: Walkthrough — create inline from invoice new → customer created + selected, draft saves with customer_id (check Network `PATCH /drafts` includes customer_id)
  - `rule` TR-2.3: Walkthrough — edit selected customer in invoice new → PATCH returns 200, selected badge updates, draft clientName/clientEmail reflect changes
  - `rule` TR-2.4: Cancel inline create in invoice new — amount/description/asset previously typed preserved exactly (AC-10)
  - `rubric` TR-2.5: Integration cleanness; scale 1-5; 1 = breaks or warnings; 3 = works but extra state/props hacks; 5 = minimal diff, no logic moved, clean wiring; threshold >= 4; evidence = final diff of page.tsx

## Task 3: Integrate CustomerQuickSelect into POS form
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - In `web/app/pos/page.tsx`, delete the local `CustomerSearch` component (lines 93–219 approx)
  - Keep existing `CustomerNameField` for free-text walk-in name (it is separate by design)
  - Render `<CustomerQuickSelect />` in place of the deleted `CustomerSearch`, passing `onCustomerSelect={setSelectedCustomer}` (same signature)
  - Keep the cashier-mode `<details>` disclosure wrapping; inside it swap the order so CustomerQuickSelect comes first (it already shows name/email), then optional free-text field — or keep exact original order, as long as integration works
  - Ensure POS `handleSubmit` still uses `selectedCustomer?.name || customerName.trim() || "Walk-in Customer"`; no changes needed there
  - Confirm Alt shortcuts, amount autofocus, and recent-sales panel unaffected
- **Acceptance Criteria Addressed**: AC-2 (create in POS), AC-4 (edit in POS), AC-7 (duplicate on edit POS)
- **Test Requirements**:
  - `rule` TR-3.1: `CustomerSearch` symbol no longer defined in pos/page; TS build succeeds
  - `rule` TR-3.2: Walkthrough — create inline from POS → POST 201, selected customer set, success message visible; POS submit still sends `customer_id` in invoice body (check Network)
  - `rule` TR-3.3: Walkthrough — select customer in POS → Edit → change name → save → selected badge updates; next POS submit uses updated name
  - `rule` TR-3.4: Cashier mode toggle still works; amount field auto-focuses, Alt+1/Alt+A shortcuts function
  - `rubric` TR-3.5: POS UX coherence; scale 1-5; 1 = confusing layout; 3 = works but cramped; 5 = fits naturally with existing POS form width and cashier disclosure; threshold >= 4; evidence = screenshot of POS form with inline create open

## Task 4: Add frontend unit/component tests for CustomerQuickSelect
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - Check existing frontend test setup (look for jest/vitest config, test files in `web/`)
  - If a test runner is already configured, add tests covering:
    - Empty-name validation blocks submit (no API call)
    - Invalid email format blocks submit (no API call)
    - Successful create → onCustomerSelect called with returned customer + form collapses
    - Successful edit → onCustomerSelect NOT called with null (selection preserved) + PATCH sent
    - 409 Conflict on create → error banner visible + "Use existing" works (mocks)
  - If no test runner is configured for `web/`, skip with a clear note in evidence (and still manually verify each case in DevTools)
- **Acceptance Criteria Addressed**: AC-1 through AC-7 (each test provides coverage)
- **Test Requirements**:
  - `rule` TR-4.1: Either (a) test file exists at `web/components/CustomerQuickSelect.test.tsx` and runs green via project's test command, OR (b) documented evidence that no frontend test runner exists + manual verification for each of the 5 scenarios above with screenshot/proof
  - `rubric` TR-4.2: Coverage quality; scale 1-5; 1 = no tests or evidence; 3 = partial; 5 = all 5 scenarios automated or manually tested with clear evidence; threshold >= 4; evidence = test output file or markdown note

## Task 5: Run lint, typecheck, and build for web
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1, 2, 3
- **Description**:
  - In `web/`, run `npm run lint` (or project's lint command per package.json scripts)
  - Run typecheck: `npx tsc --noEmit` or `npm run typecheck` if script exists
  - Run `npm run build` to ensure Next.js app builds cleanly
  - Fix any type errors, lint warnings, or build failures introduced by Tasks 1–3
- **Acceptance Criteria Addressed**: NFR-2, NFR-3, NFR-4
- **Test Requirements**:
  - `rule` TR-5.1: Lint passes with no new errors/warnings (compare before/after count if baseline exists)
  - `rule` TR-5.2: TypeScript `tsc --noEmit` returns exit 0
  - `rule` TR-5.3: Next.js build (`next build`) completes without errors
  - `rubric` TR-5.4: Build clean-up; scale 1-5; 1 = build breaks; 3 = builds but with warnings or unused vars; 5 = clean, zero unused, zero new any types; threshold >= 4

## Task 6: Run backend checks (no backend changes expected)
- **Status**: `pending`
- **Priority**: low
- **Depends On**: None
- **Description**:
  - Sanity-check backend: verify existing customers API still works; run backend lint/typecheck/test (existing commands) to confirm nothing was accidentally broken (we are not changing backend code)
  - Add backend customer API quick check via existing spec tests (if any): `backend/src/customers/customers.service.spec.ts` passes unchanged
- **Acceptance Criteria Addressed**: None directly (risk mitigation)
- **Test Requirements**:
  - `rule` TR-6.1: Backend `npm run lint` (or equiv) passes, 0 new warnings
  - `rule` TR-6.2: `customers.service.spec.ts` passes if runnable

## Issue I-1: AC-6/AC-7 email field not highlighted on 409 duplicate conflict
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Discovered By**: Review R1
- **Description**:
  - Findings F1: When `handleSubmit` catches HTTP 409 duplicate-email and sets `duplicateMatch`/`formSubmitError`, the email input does not get `aria-invalid` or the red-ring visual highlight because those only key off `formErrors.email` (client-side validate() only).
  - Fix: After `setDuplicateMatch(...)`, also call `setFormErrors(prev => ({ ...prev, email: "A customer with this email already exists" }))`. Clear on Cancel/next-user-input.
- **Acceptance Criteria Addressed**: AC-6, AC-7
- **Test Requirements**:
  - `rule` TR-I-1.1: Static inspection — after 409 handling block, `setFormErrors` called with `email:` field error; Cancel handler/X/Esc handler clears both `duplicateMatch` and `formErrors.email`
  - `rule` TR-I-1.2: On 409 path, email `<input>` has `aria-invalid="true"` and red-ring classes applied (read-only check of conditional logic)
- **Notes**: Gating — blocks AC-6 and AC-7 rule pass

## Issue I-2: NFR-2 form inputs lack accessible `<label>` (only placeholder)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Discovered By**: Review R1
- **Description**:
  - Finding F2: In `CustomerFormBody`, name/email/notes inputs rely solely on `placeholder="..."`. Placeholders are not accessible labels (WCAG failure). NFR-2 requires "labels associated with inputs".
  - Fix: Add visually-hidden (`sr-only` via Tailwind `sr-only` class) `<label>` elements with `htmlFor`/`id` pairs for each input. Keep placeholders as secondary hints.
- **Acceptance Criteria Addressed**: NFR-2, FR-3
- **Test Requirements**:
  - `rule` TR-I-2.1: All three form inputs have an associated `<label>` (visible or sr-only) with `htmlFor` matching the input's `id`
  - `rule` TR-I-2.2: Each input has its own unique `id` attribute (no duplicates between create/edit instances — React ensures this since both share the same form body component and there is only one mounted at a time)
- **Notes**: Gating WCAG accessibility fix

## Issue I-3: Minor a11y/UX clean-ups (F3, F4, F6)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Discovered By**: Review R1
- **Description**:
  - F3: Add aggregate form-level validation summary banner for client-side errors (FR-3 partial gap).
  - F4: Change success timeout 2500ms → 2000ms to match spec exactly (AC-8 duration target).
  - F6: Combobox "+ Create new client" row has no `id`, and `aria-activedescendant` never points to it. Add `id="customer-option-create"` to the Create `<li role="option">` and include it in the aria-activedescendant mapping when `highlightIndex === results.length`.
- **Acceptance Criteria Addressed**: AC-8, NFR-2, FR-3
- **Test Requirements**:
  - `rule` TR-I-3.1: Success setTimeout duration is 2000 ms
  - `rule` TR-I-3.2: Create row `<li>` has a stable `id` attribute AND `aria-activedescendant` can resolve to it when `highlightIndex === results.length`
  - `rubric` TR-I-3.3: Overall UX completeness; scale 1-5; 1 = missing items; 3 = partial; 5 = all three sub-items addressed cleanly; threshold >= 4; evidence = file content
- **Notes**: Non-gating but recommended (recommended F4/F6 in review)

