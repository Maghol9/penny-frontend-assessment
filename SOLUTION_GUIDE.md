# Penny Frontend Assessment — Solution Walkthrough

This guide explains the implementation in the same language as the source code. The project is an **Angular 15 Change Request reviewer** with a **provided mock API**. There is no backend to build.

## 1. Set up on Windows (VS Code)

1. Install VS Code and **Node.js 18.20.3** (the version in `.nvmrc`). Verify with `node -v` and `npm -v`.
2. Extract the ZIP, then choose **File > Open Folder** in VS Code and select the folder that contains `package.json`.
3. Choose **Terminal > New Terminal** and run:

```powershell
npm ci
npm start
```

4. Open <http://localhost:4200>. Leave the terminal running while testing the UI.
5. In a second terminal, run the quality checks before submission:

```powershell
npm test -- --runInBand
npm run typecheck
npm run build
npm run lint
npm run format
```

`npm run format` changes TypeScript formatting; inspect `git diff` afterward. If PowerShell prevents an npm command from running, try `npm.cmd` instead of `npm` or use the Command Prompt terminal. **Do not submit without confirming that all tests, build, and lint checks pass locally.**

## 2. Understand the demo data

`src/api/fixtures.ts` contains users and sample requests:

- `approver`: can read and approve requests in `org-alpha`.
- `viewer`: can read requests in `org-alpha`, but cannot approve or reject.
- `otherOrg`: belongs to `org-beta`, so `CR-1` is not accessible to this user.
- `CR-1`: `PENDING_APPROVAL`; item `SKU-A` increases from quantity 10 to 11.
- `CR-2`: `APPLIED`; it is no longer actionable.
- `CR-3`: `DRAFT`; it is not actionable either.

The mock API in `src/api/cr-api.service.ts` provides `listChangeRequests`, `getChangeRequest`, `approve`, and `reject`, plus `latencyMs` and `failNext` for testing.

## 3. Fix the line-item diff

**File:** `src/components/diff.util.ts`

The starting bug compared unit price only, so it missed quantity-only changes. The fixed comparison is:

```ts
const changed = b.quantity !== p.quantity || b.unitPrice !== p.unitPrice || b.description !== p.description;
```

The `computeDiff()` function matches items by SKU and returns `added`, `removed`, `changed`, or `unchanged`. The pure tests in `src/components/diff.spec.ts` check all four kinds and changes to quantity, price, and description.

## 4. Complete the list and the filter

**Files:** `src/components/cr-list/cr-list.component.ts` and `.html`

`load()` sets loading, calls the API, then sets `loaded`, `empty`, or `error`. The filter is a derived getter:

```ts
get visibleRows(): CrSummary[] {
  const rows = this.state.data ?? [];
  return this.statusFilter === 'ALL' ? rows : rows.filter((row) => row.status === this.statusFilter);
}
```

The table renders `visibleRows`, not the unfiltered list. A separate message appears when a filter matches no rows. The error state includes Retry, which calls `load()` again. A request version keeps old responses from replacing a later refresh.

## 5. Complete the detail screen

**Files:** `src/components/cr-detail/cr-detail.component.ts` and `.html`

- `diff` calls `computeDiff()` to show before/after line items.
- `fmt()` shows amounts with the CR currency; the header displays baseline total, proposed total, and their difference.
- `timeline` sorts a copy of audit events by `at` ascending, so the original API array is left unchanged.
- `ngOnChanges()` reloads the details when the selected `id` changes.
- `canApprove` checks all of: loaded data, `PENDING_APPROVAL` status, and the session's approval policy; `canReject` uses the same gate.

## 6. Implement safe Approve / Reject

- `approve()` verifies the gate and checks that no action is already in progress, then calls `api.approve()`.
- `reject()` also requires a valid rejection reason, trims whitespace, and calls `api.reject()`.
- `submitting` disables further clicks during a slow network response.
- On success, the returned CR is displayed and the list is refreshed.
- On an action error, the component **re-reads** the latest CR before deciding what the UI can show. The mock API stores the changed status before settling its Promise, so a rejected Promise may still correspond to a completed approval/rejection.
- If the reconciliation read fails too, the detail switches to an error/retry state instead of enabling an action against unknown status.

These behaviors live in `performAction()` and are covered by component tests.

## 7. Manually test the UI

1. Choose **approver** and open `CR-1`. Confirm that `SKU-A` is `changed`, `SKU-B` is `unchanged`, and the difference is **USD 500.00**.
2. Check the timeline order: **CREATE**, **SUBMIT**, **SEND_FOR_APPROVAL**.
3. In the list filter, choose `PENDING_APPROVAL` (only `CR-1` should remain) and then `REJECTED` (before taking any action, an empty-filter message should appear).
4. Switch to **viewer**. Approval must be disabled, and the rejection form must not appear.
5. Switch to **approver** and choose `CR-2`. It has status `APPLIED`, so neither review action is permitted.
6. Return to `CR-1`, enter only spaces as the rejection reason, and verify Reject stays disabled. Enter a real reason and reject; the status and timeline should update.
7. Reload the app to restore the fixture's initial state. Approve `CR-1` and verify it becomes `APPROVED`.
8. Press **Demo: fail list load** and verify the list displays an error. Press **Retry** to restore it.

**Important:** The mock API data resets when the browser application is fully reloaded; it is not a persistent backend.

## 8. Automated tests and submission

Tests are in `src/components/*.spec.ts` and each component's folder. They use Jest and Angular TestBed to assert actual rendered behavior, not only method return values.

Before submitting, confirm:

- `npm ci && npm test -- --runInBand` succeeds from a clean installation.
- `npm run typecheck`, `npm run build`, and `npm run lint` succeed.
- Your final `IMPLEMENTATION_NOTES.md` accurately reflects what **you** implemented and verified, including AI usage.
- The git repository contains multiple meaningful commits, not one squashed submission.
- You have recorded the required **5–8 minute walkthrough video**, including a reject decision and an error state.

## 9. Interview questions to be ready for

**Q: Why does the diff compare quantity as well as price?** Because quantity-only changes affect the purchase agreement even when unit price stays the same.

**Q: Why are actions guarded both in the component and template?** The template gives immediate feedback; the method guard protects against programmatic calls and double clicks. A production backend must also authorize the action.

**Q: Why re-fetch after an action error?** A network error may happen after the server commits the update. Refreshing the authoritative state avoids offering a duplicate decision.

**Q: What does `requestVersion` solve?** It stops an old asynchronous response from overwriting the details of a more recently selected CR.

**Q: What would you improve?** Add backend authorization and idempotency, owner/workspace metadata, accessible confirmations, and browser-level end-to-end tests.
