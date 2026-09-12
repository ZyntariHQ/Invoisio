# Inline Customer Quick-Create & Edit - Independent Review

- [ ] CP-R1 Reviewed

---

## Review History

### Review R1

**Date**: 2026-09-12
**Reviewer**: Static Code Analysis (Independent)
**Result**: **FAIL** (2 rule-type ACs fail; multiple actionable findings present)

---

#### Checkpoint Results

| ID | Type | Result | Detail |
|----|------|--------|--------|
| AC-1 | rule | **PASS** | Create flow in /invoices/new auto-selects, no nav, success shown. |
| AC-2 | rule | **PASS** | Same create flow works in /pos via shared component. |
| AC-3 | rule | **PASS** | Edit in /invoices/new runs PATCH and updates display + draft. |
| AC-4 | rule | **PASS** | Edit in /pos shares same implementation; selectedCustomer updates. |
| AC-5 | rule | **PASS** | validate() runs before network; inline errors + aria-invalid set. |
| AC-6 | rule | **FAIL** | 409 actionable suggestion exists, but email field is NOT highlighted (no aria-invalid / red ring on conflict). |
| AC-7 | rule | **FAIL** | 409 on edit is form-level, not inline on email field; email field receives no highlight or aria-invalid. (Cancel restore does work.) |
| AC-8 | rubric | **Score 4 / 5** | Threshold ≥4: **PASSED** |
| AC-9 | rule | **PASS** | Single CustomerQuickSelect imported by both pages; no duplicated form state. |
| AC-10 | rule | **PASS** | Cancel only touches component-internal state; parent fields untouched. |

---

#### Evidence (per AC)

**AC-1 — Pass.**
CustomerQuickSelect.tsx lines 269–273: on create success, calls `selectCustomer(created)` → `resetFormFields()` → `showSuccess("Client saved ✓")`. `selectCustomer` (lines 148–159) sets internal selected state and fires `onCustomerSelect`; no router navigation call exists in this path. invoices/new/page.tsx lines 180–195 (`handleCustomerSelect`) propagates name, email, and customer_id to the draft.

**AC-2 — Pass.**
pos/page.tsx lines 468–474 (cashier mode) and lines 485–491 (normal mode) render `<CustomerQuickSelect onCustomerSelect={setSelectedCustomer} … />`. The shared create path (CustomerQuickSelect.tsx lines 269–273) updates `selectedCustomer` in POS FormView state; lines 305–306, 312 consume `selectedCustomer` in the submit payload. No navigation occurs.

**AC-3 — Pass.**
CustomerQuickSelect.tsx lines 274–281: on edit success, runs `CustomerService.update(...)` (PATCH) → `selectCustomer(updated)` → `showSuccess("Client updated ✓")`. The selected-customer chip at lines 427–460 re-reads `selectedCustomer.name/.email`, so display updates immediately. invoice/new `handleCustomerSelect` (page.tsx lines 180–195) writes the updated name/email back to the draft; `customer_id` is unchanged.

**AC-4 — Pass.**
Same edit path (CustomerQuickSelect.tsx lines 274–281) runs for POS since it uses the shared component. POS FormView line 229 binds the CustomerNameField input to `selectedCustomer ? selectedCustomer.name : customerName`, so the chip+free-text name display updates after save.

**AC-5 — Pass.**
`validate()` at CustomerQuickSelect.tsx lines 33–51 returns `errors.name` for empty name (line 39) and `errors.email` for invalid email (line 44). `handleSubmit` lines 254–256 short-circuit before any network call on validation failure. Name input `aria-invalid` at line 615, email at line 642; red-ring classes lines 619–623 and 646–650; inline `<p role="alert">` errors at lines 625–633 and 652–660.

**AC-6 — Fail.**
409 detection (lines 285–290), `duplicateMatch` search (lines 294–306), and the "Use existing client" suggestion UI (lines 718–738 + line 500) are implemented and work. **However:** the email input does not receive aria-invalid nor red-ring styling on 409 conflict — its highlight logic (lines 642, 646–650) only keys off `formErrors.email`, which is set *only* by client-side `validate()`, never by the 409/duplicate-match path. AC-6 Then clause explicitly requires "email field highlighted".

**AC-7 — Fail.**
Same underlying issue as AC-6: when edit produces 409, the conflict appears as a generic form-level card (duplicateMatch UI, lines 718–738), not "surfaced inline on the email field". The email input lacks aria-invalid, aria-describedby, and visual red-ring tied to the duplicate/conflict state. Cancel restore *does* work correctly: `selectedCustomer` is only mutated inside `selectCustomer` which is not called until the PATCH succeeds (lines 274–281), so prior email is preserved on cancel.

**AC-8 — Score 4/5 (threshold ≥4: PASSED).**
`showSuccess()` at lines 106–110 sets the message and clears it via `setTimeout(..., 2500)`. The rendered banner (lines 416–425) is inline below the combobox, has `role="status"` + `aria-live="polite"`, uses the `CheckCircle2` icon, an emerald background, and does not block input (no backdrop, no modal, no focus trap). The only gap vs spec anchor 5 is duration is 2500 ms rather than the ~2000 ms called out (≈25% over, borderline). Rationale: brief, visible, non-blocking, auto-dismisses — all rubric criteria met; duration is the single minor delta.

**AC-9 — Pass.**
Grep/imports: invoices/new/page.tsx line 8, pos/page.tsx line 19 both `import { CustomerQuickSelect } from "@/components/CustomerQuickSelect"`. All create/edit state (`mode`, `formName`, `formEmail`, `formNotes`, `formErrors`, `formSubmitError`, `duplicateMatch`, `isSubmitting`, success, refs) lives exclusively in CustomerQuickSelect.tsx lines 80–96. Neither page defines parallel create/edit form state or inline form markup.

**AC-10 — Pass.**
`closeForm()` (lines 112–117), called by Cancel/X/Escape, mutates only component-internal state (`mode`, `formErrors`, `formSubmitError`, `duplicateMatch`). It never calls `onCustomerSelect` and never touches parent data. Invoice page amount/description/asset/dueDate (page.tsx lines 34–38 + handlers lines 121–166) and POS amount/asset/memo (pos/page.tsx lines 249–257 + inline handlers) are fully decoupled from CustomerQuickSelect internals.

---

#### Findings (Actionable)

**F1. AC-6 / AC-7 bug: Email field not highlighted on 409 duplicate conflict.**
CustomerQuickSelect.tsx: the email `<input>` (line 637) and notes `<textarea>` base their `aria-invalid` and red-ring CSS *solely* on `formErrors.<field>`, which is populated only by the synchronous `validate()` call. When `handleSubmit` catches a 409 (lines 283–310) and sets `duplicateMatch`/`formSubmitError`, neither state feeds back to highlight the email input.
- Fix suggestion: after line 303/305 sets `setDuplicateMatch(exact)`, also run `setFormErrors(prev => ({ …prev, email: "A customer with this email already exists" }))` so the existing aria-invalid + red-ring pipeline applies. Clear this on Cancel/input change.
- Impact: AC-6 and AC-7 currently fail their explicit Then clauses.

**F2. Accessibility (NFR-2): Form inputs have no `<label>` — only placeholders.**
CustomerQuickSelect.tsx `CustomerFormBody` (lines 604–771): the three inputs (name line 607, email line 637, notes line 664) use `placeholder="Client name *"` etc. with no associated `<label htmlFor>`. Placeholders are not accessible labels (disappear on input, not read by all screen readers as the primary label). NFR-2 explicitly requires "labels associated with inputs" and FR-3 requires field-level error wiring.
- Fix suggestion: add visually-hidden (sr-only) `<label>` elements for each input with matching `htmlFor` / `id` pairs; keep placeholders as hints only.
- Impact: WCAG failure; screen-reader users cannot reliably identify the three form fields.

**F3. FR-3: Missing form-level aggregate validation banner.**
FR-3 requires "Errors display inline next to the offending field with a form-level aggregate banner." Individual inline errors are present (F1 and AC-5 verified those); there is no top-of-form summary banner when client-side validation fails. `formSubmitError` (line 740–748) only shows network/backend errors, not a summary of validation errors.
- Fix suggestion: add a banner above the first field that renders `Object.keys(formErrors).length` summary (e.g. "Please fix 2 errors above") when `Object.keys(formErrors).length > 0`.
- Impact: minor; AC-5 pass condition focuses on inline messages + no network (which works), so AC-5 is still marked Pass, but FR-3 is partially unmet.

**F4. AC-8 timing delta: 2500 ms vs spec ≈2000 ms.**
CustomerQuickSelect.tsx line 109: `setTimeout(() => setSuccessMessage(null), 2500)`. AC-8 rubric anchor is "brief (≈2s)". 2500 ms is within "approximately" but not the stated target.
- Fix suggestion: change to `2000` to match spec exactly; or document the 2.5 s choice.
- Impact: no AC failure; AC-8 threshold met at score 4.

**F5. No tests referenced/visible for the new component or its integration.**
Spec ACs all have "Evidence: Screenshot or passing end-to-end/unit test" as part of pass conditions. Static review cannot confirm runtime; there is no co-located `*.test.*` file, and the component (CustomerQuickSelect.tsx) has no test references in the three inspected files.
- Suggestion: add unit tests covering validate(), 409 path (mock Conflict), cancel-does-not-affect-parent, and edit-preserves-previous-on-cancel; plus one e2e walkthrough each for invoices-new and POS.

**F6. Accessibility (minor): Combobox listbox arrow-key highlight count off-by-one vs rendered items.**
CustomerQuickSelect.tsx lines 233–238: `ArrowDown` caps at `results.length` (inclusive), and `ArrowUp` floors at `0`. Rendered list has `results.length` customer options plus one "Create new client" option (total = `results.length + 1` items), so highlight can reach the Create entry but `aria-activedescendant` at lines 350–354 only maps indices `< results.length` to an `id`. When the Create row is highlighted, `aria-activedescendant` is `undefined`. Row 399–412 (Create option) also lacks an `id` attribute, so even if the index mapped, there would be no target.
- Fix suggestion: give the Create `<li role="option">` its own `id` (e.g. `customer-option-create`) and include it in `aria-activedescendant` when `highlightIndex === results.length`.

---

#### Recommended Issues (optional, non-blocking nice-to-haves)

- **R1**: CustomerQuickSelect.tsx line 97–104 updates state directly during render (`if (value !== prevValue) { setPrevValue(value); setQuery(…); setSelectedCustomer(…); }`). This works but triggers a double-render and is a React anti-pattern. Consider deriving via `useEffect([value])` instead — no functional bug, but potential future StrictMode warnings.
- **R2**: CustomerQuickSelect.tsx line 344 placeholder inherits `searchPlaceholder` prop but invoice/new and POS both pass a custom one; the default "Type to search saved clients..." is fine, though consider making the label/helper prop naming more consistent (label/helperText exist; searchPlaceholder differs semantically but it's acceptable).
- **R3**: pos/page.tsx CustomerNameField (lines 205–240) co-exists with CustomerQuickSelect and its `onChange` handler line 230–233 clears `selectedCustomer` if the user types a free-text name *after* selecting via CustomerQuickSelect. This is existing intended behavior per spec Background & Context; however, after an inline Edit save via CustomerQuickSelect, any unsynced free-text entry the user may have typed there will be silently overridden by `selectedCustomer.name` (line 229). Documenting or clearing `customerName` state inside POS's customer-select callback would make this explicit.

---

#### Overall Result: FAIL

Rationale: Rule-type ACs AC-6 and AC-7 fail due to the missing email-field highlight on 409 Conflict (F1). Additional actionable findings: accessibility missing labels (F2) and missing tests (F5). Per review rubric, any >0 actionable finding yields overall Fail. Recommend addressing F1 and F2 before marking pass; F3/F4/F6 are recommended but not gating.
