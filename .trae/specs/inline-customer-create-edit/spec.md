# Inline Customer Quick-Create & Edit - Product Requirements Document

## Overview
- **Summary**: Add inline quick-create and lightweight edit flows for customer records from the invoice creation and POS screens, so merchants can create or fix customer data without leaving the active form.
- **Purpose**: Reduce workflow friction. Today a merchant must abandon an invoice or POS sale, navigate to the Customers page, make the change, and return. This slows down in-context billing and point-of-sale.
- **Target Users**: Merchants creating invoices and running the POS terminal.

## Goals
- Merchant can create a new customer from within the invoice-new and POS forms without navigating away.
- Merchant can edit name/email/notes of an already-selected customer directly from the form.
- Customer search, selection, creation, and edit remain responsive with clear loading and success feedback.
- Duplicate email warnings and validation errors are surfaced in-context and actionable.
- Reuse existing customer autocomplete patterns to keep the experience coherent across the app.

## Non-Goals
- Full customer directory management (the `/customers` page handles this).
- Customer deletion from the invoice/POS forms.
- Invoice history or summary viewing inline (available via `/customers/[id]`).
- Bulk import or CSV operations in this context.
- Changes to backend customer schema or API beyond optional duplicate-detection helper endpoints (if needed).

## Background & Context
Existing implementation inspected 2026-09-12:
- Backend (`backend/src/customers/`): CRUD via `CustomersService` and `CustomersController`. Name required (max 200), email optional validated via `IsEmail`, notes optional (max 1000). Duplicate `(merchantId, email)` raises `ConflictException` via Prisma P2002. Search endpoint `GET /customers/search?q=` supports name/email contains-insensitive.
- Frontend `CustomerService` (`web/lib/customer-service.ts`): `search`, `list`, `get`, `create`, `update`, `remove`.
- `web/app/invoices/new/page.tsx`: Defines local `CustomerAutocomplete` which already has a basic inline create form triggered by "+ Create new client" at dropdown bottom. **Missing**: inline edit of a selected customer, duplicate suggestion hints before submit, success feedback toast, and the form is local (not shared).
- `web/app/pos/page.tsx`: Defines local `CustomerSearch` with debounced search/select and `CustomerNameField`. **Missing**: inline create entirely, inline edit, validation display, duplicate hints.
- `web/app/customers/page.tsx`: Has modal add/edit forms with react-query mutations. Good reference for field labels, validation style, and error display.
- Existing patterns: debounce 250ms, tailwind inline form with blue-50/blue-200 card, outside-click close, `extractApiErrorMessage` for errors.

## Functional Requirements
- **FR-1**: In both `/invoices/new` and `/pos`, the customer selector area exposes a way to open an inline quick-create form (name*, email, notes) without leaving the page.
- **FR-2**: In both screens, when a customer is already selected, an "Edit" action opens an inline edit form pre-filled with that customer's name/email/notes; saving updates the customer record and the in-memory selection; cancelling restores prior state.
- **FR-3**: Quick-create and edit share the same field validations as the backend DTO: name required, email format when provided, notes max length 1000. Errors display inline next to the offending field with a form-level aggregate banner.
- **FR-4**: On submit of quick-create, if the backend returns 409 Conflict (duplicate email), the UI clearly shows the duplicate message, highlights the email field, and offers a clickable suggestion to use the existing matching customer (triggering a search + auto-select).
- **FR-5**: On successful create, the new customer is auto-selected in the invoice/POS form, the create form collapses, and a brief success confirmation is shown (e.g. 2s "Client saved ✓").
- **FR-6**: On successful edit, the edit form collapses, the selected customer display updates, and a brief success confirmation is shown.
- **FR-7**: Customer search (debounced autocomplete) in both flows works consistently with the existing patterns (dropdown list, keyboard nav, outside-click close, clear selection button).
- **FR-8**: During create/edit submission, a loading/processing state is shown (button disabled + spinner text) and the form cannot be double-submitted.
- **FR-9**: The quick-create form can be cancelled/closed at any time without affecting the currently selected customer or other form fields.

## Non-Functional Requirements
- **NFR-1**: Responsive and predictable: no visible jank on search, create, or edit; operations resolve within typical network latency (<1s expectation) with loading states visible within 200ms.
- **NFR-2**: Accessible: labels associated with inputs, error messages tied via aria-describedby, dialog-ish forms keyboard-dismissible with Escape, loading state conveyed via aria-busy/aria-disabled.
- **NFR-3**: Consistency: visual design matches existing inline forms in `CustomerAutocomplete` and modal forms in `/customers` (same rounded-lg, ring styles, blue palette, font sizes).
- **NFR-4**: Maintainable: shared UI extracted to a reusable component so invoice-new and POS screens use the same selector/create/edit logic; no two parallel implementations with duplicated form state.
- **NFR-5**: No draft state loss: any create/edit flow must not clear or interfere with the invoice form's `clientName`, `clientEmail`, `amount`, draft autosave, or POS form state.

## Constraints
- **Technical**: Must be a Next.js "use client" React component (existing app is Next.js 14+ App Router with "use client" pages). Tailwind for styling (no new CSS framework). Existing `CustomerService` + `apiClient` must be used as-is (no rewrite).
- **Business**: No new customer fields beyond what the backend already supports (name, email, notes). Unique email per merchant is enforced by backend, not relaxed.
- **Dependencies**: Cannot add new npm packages without review; implement with existing deps (react, react-dom, next, `lucide-react` icons used in customers page).

## Assumptions
- Backend `ConflictException` is returned as HTTP 409 with a readable message that `extractApiErrorMessage` can surface.
- Backend `search` endpoint is fast and reliable enough to also drive duplicate hints; if a create form's typed email matches an existing customer via search, we can surface "Did you mean…?" as a non-blocking hint.
- The POS `customerName` free-text field can co-exist with the saved-customer selector; when a saved customer is selected, the free-text field stays disabled/synced per existing behavior.

## Acceptance Criteria

### AC-1: Inline quick-create available in invoice-new form
- **Type**: `rule`
- **Given**: Merchant is on `/invoices/new` with no customer selected
- **When**: Merchant types a name into customer search, clicks "+ Create new client" entry, fills name + email, and saves
- **Then**: The customer is created via `POST /customers`, auto-selected in the form, create form collapses, success toast visible for ~2s, `clientName`/`clientEmail`/`customer_id` reflected in the draft
- **Pass Condition**: Manual UI walkthrough succeeds; browser network tab shows POST 201 and subsequent draft update; no navigation away from the page
- **Evidence**: Screenshot + network log or passing end-to-end/unit test

### AC-2: Inline quick-create available in POS form
- **Type**: `rule`
- **Given**: Merchant is on `/pos` with no customer selected
- **When**: Merchant opens the inline create flow, fills name/email, saves
- **Then**: Customer is created and auto-selected, `selectedCustomer` state is set, no navigation, success feedback shown
- **Pass Condition**: Manual UI walkthrough + network tab shows POST 201; POS `FormView` state reflects selection
- **Evidence**: Screenshot or passing end-to-end/unit test

### AC-3: Inline edit of selected customer in invoice-new
- **Type**: `rule`
- **Given**: A customer is selected in `/invoices/new` (search + pick from dropdown)
- **When**: Merchant clicks the "Edit" action for the selected customer, changes email to a new valid value, saves
- **Then**: `PATCH /customers/:id` returns 200, selected customer display updates, edit form collapses, success toast shown, draft customer_id unchanged, `clientName`/`clientEmail` reflect the update
- **Pass Condition**: Manual walkthrough; network tab shows PATCH 200 with updated payload; page state reflects changes
- **Evidence**: Screenshot or passing test

### AC-4: Inline edit of selected customer in POS
- **Type**: `rule`
- **Given**: A customer is selected in `/pos`
- **When**: Merchant clicks "Edit", modifies notes, saves
- **Then**: `PATCH /customers/:id` succeeds; selected customer and POS state update; no navigation
- **Pass Condition**: Manual walkthrough; network PATCH 200; UI reflects notes change
- **Evidence**: Screenshot or passing test

### AC-5: Client-side validation and inline errors
- **Type**: `rule`
- **Given**: Create form open in either screen
- **When**: Merchant leaves name empty or enters invalid email and tries save
- **Then**: Form does not submit, field-level error shown, red ring on offending input, form-level banner summarizes
- **Pass Condition**: Manual test with empty name and invalid email shows inline messages and no network request
- **Evidence**: Screenshot or passing validation test

### AC-6: Duplicate email (409 Conflict) actionable hint on create
- **Type**: `rule`
- **Given**: Merchant is in create form, fills email that already exists for another customer in the same merchant
- **When**: Merchant clicks Save
- **Then**: Backend returns 409, error banner shows "A customer with this email already exists...", email field highlighted, a clickable suggestion "Use existing client: <name>" auto-selects the matching customer and closes the create form
- **Pass Condition**: Manual or mocked-response test; shows Conflict handling path; clicking suggestion selects the match
- **Evidence**: Screenshot or test with mocked 409 response

### AC-7: Duplicate email hint also works on edit
- **Type**: `rule`
- **Given**: Merchant edits customer A's email to that of existing customer B (same merchant)
- **When**: Merchant clicks Save
- **Then**: 409 is surfaced inline on the email field with message; no data lost in form; cancelling restores customer A's previous email
- **Pass Condition**: Manual or mocked-response test passes
- **Evidence**: Test output or screenshot

### AC-8: Success feedback visible and non-blocking
- **Type**: `rubric`
- **Dimension**: Clarity and unobtrusiveness of create/edit success feedback
- **Scale**: 1-5
- **Anchors**: 1 = no feedback at all or flash of unstyled content; 3 = text appears but is easy to miss or blocks the UI; 5 = brief (~2s) visible confirmation (toast or inline banner with checkmark) that disappears automatically without blocking interactions
- **Pass Threshold**: >= 4
- **Evidence**: Manual UX walkthrough or screenshot showing success state

### AC-9: Shared component architecture
- **Type**: `rule`
- **Given**: After implementation
- **When**: Inspecting source tree under `web/components/`
- **Then**: A single reusable customer selector component (with embedded search/select/create/edit) exists and is imported by both `/invoices/new/page.tsx` and `/pos/page.tsx`; no duplicated inline form state logic
- **Pass Condition**: Both pages import the new component; grep shows only one definition of the create/edit form state
- **Evidence**: File listing + grep output

### AC-10: Form state isolation (no draft/POS data loss)
- **Type**: `rule`
- **Given**: Invoice-new with draft data filled in (amount, description, dueDate) OR POS with amount/asset/memo entered
- **When**: Merchant opens the inline customer create form, fills some fields, then Cancels (without saving)
- **Then**: Draft/POS form state (amount, description, asset, memo, etc.) is unchanged; no autosave is corrupted; no fields are cleared
- **Pass Condition**: Manual test: state before and after cancel is byte-identical (or equivalent visible values)
- **Evidence**: Screenshot pair or test assertion

## Open Questions
- [ ] None identified — scope is bounded by existing backend schema and clear UI patterns.
