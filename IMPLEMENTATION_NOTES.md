# Implementation Notes

## 1. What I changed

The reviewer has two screens: a change-request list for finding a request and a detail view for checking its proposed changes, history, and available decisions. I kept the existing Angular 15 standalone-component structure and mock API. No backend or new dependency was introduced.

- **Diff/preview:** `computeDiff` now detects changes to quantity, unit price, or description. It continues to classify added, removed, and unchanged SKUs.
- **List:** The status selector filters both `visibleRows` and the rendered table. Loading, no requests, no filter matches, and request failure are distinct states; the error screen offers Retry. Older list responses cannot replace a newer load.
- **Detail:** The before/after comparison shows line items and formatted baseline, proposed, and delta totals. The timeline sorts a *copy* of the audit log in chronological order. Switching the selected request reloads the correct details.
- **Permissions and decisions:** Only a user with an approval policy reviewing a `PENDING_APPROVAL` request can approve or reject it. A read-only user cannot submit either action. Reject requires a non-whitespace reason, which is trimmed before it is sent.
- **Network behavior:** A submission disables further actions while pending. On success, the returned CR replaces the detail and notifies the list. On a rejected action response, the UI re-fetches the CR before allowing further decisions, because the supplied mock API can update its store *before* rejecting the response. If that verification also fails, the detail enters a retryable error state rather than displaying potentially stale action controls.
- **Demo:** Added a small `Demo: fail list load` control to demonstrate the error and Retry states during the walkthrough.

## 2. Component and state model

`CrListComponent` holds an explicit `ViewState<CrSummary[]>` (`idle`, `loading`, `loaded`, `empty`, or `error`) plus the selected status filter. The filtered table is derived from loaded data, not stored separately. `CrDetailComponent` holds a `ViewState<CrDetail>`, submission and error flags, and a reactive `FormControl` for the rejection reason. Its diff, timeline, and policy gates are derived from the current detail/session. Both components call the provided `CrApiService`; the shell supplies the selected request and demo user.

A monotonically increasing request version prevents an older asynchronous load from replacing the currently selected request. Data stays visible while an action is pending, but decision controls are disabled; after an uncertain failure, the state is reconciled with the API.

## 3. Invariants

| Invariant | Enforced in |
|---|---|
| A request cannot be approved/rejected outside `PENDING_APPROVAL` or without an approval policy. | `canApprove` / `canReject` and action guards |
| A rejection reason must contain non-whitespace text. | Reactive-form validators, trimming, and `reject()` guard |
| There is at most one action in flight per detail component. | `submitting` guard and disabled buttons |
| A failed action response does not automatically imply that the action failed server-side. | `performAction()` reconciliation read |
| Old network responses cannot replace details for a newer selection. | `requestVersion` and `isCurrent()` |
| Diff and timeline calculations do not mutate API-provided arrays. | `computeDiff()` and sorted audit copy |
| An empty request list differs from a filter with no matches. | List template state branches |

## 4. Testing strategy

The expanded Jest/TestBed tests check rendered list rows, status filtering, empty/loading/error/retry states, org scoping, diff categories, totals/delta, timeline ordering, read-only access, non-pending status, cross-org access, rejection validation, duplicate-action prevention, slow responses, and action-error reconciliation. Pure tests also cover added/removed/unchanged/changed line items.

**Verification note:** The project still needs a successful `npm ci`, `npm test`, `npm run build`, `npm run lint`, and `npm run format:check` (if a formatting check script is added) in a Node.js 18.20.3 environment before submission. Automated tests and build were not executable in the preparation environment because project dependencies were unavailable; do not claim they passed until you run them locally.

## 5. Assumptions and trade-offs

- The mock API and fixtures are the contract; totals are taken from the API instead of recalculated from rows because agreement-level adjustments might exist.
- SKU is the identity used to align old/new line items. The fixtures do not contain duplicate SKUs.
- The provided `canApprovePolicy()` helper defines whether a user has an approval policy; the mock model has no ownership/workspace metadata for finer-grained scope decisions. A production API must independently enforce permissions and valid status transitions.
- I kept the UI framework-free to match the small exercise and prioritize predictable state behavior over elaborate visuals.
- The demo-only network-error control is not a production feature.

## 6. AI usage

I used an AI assistant to help inspect the scaffold, identify the root causes, suggest implementation/test cases, and draft code and documentation. I reviewed the proposed changes against the supplied API models and assessment requirements. I am responsible for verifying the behavior locally and being able to explain or modify each part.

## 7. With more time

I would add accessible confirmation dialogs, stronger error-specific messages, end-to-end browser tests, and domain metadata for accurate ownership/workspace-scoped permission checks. I would also replace the mock with a real server contract that guarantees action idempotency and authorization.
