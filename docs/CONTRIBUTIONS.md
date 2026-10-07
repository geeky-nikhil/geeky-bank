# Implementation and interview guide

Base: ankurdotio/backend-ledger at b6bbfc5d54772103a8a2ccadf956fb27bcb3fa2b. Tutorial implementation by Ankur Prajapati / Sheryians Coding School. Extensions developed with Codex assistance.

## Ownership
The old controller selected a sender by account ID alone. The service now compares sender.user with the authenticated actor inside the transaction. Client-supplied initiatedBy/systemUser values are never used to authorize transfers.

## Concurrent spending
An atomic pair of ledger inserts alone does not prevent overspending: two transactions can read the same balance and insert disjoint ledger documents. We increment ledgerVersion on both accounts in sorted ID order inside the transaction before aggregating balances in the same session. MongoDB write conflicts make competing transactions retry with a fresh snapshot. withTransaction handles abort/retry/commit; finally closes the session. Operations inside the transaction are sequential. The design serializes hot accounts and balance aggregation costs grow with account history.

## Idempotency
A unique global idempotencyKey prevents duplicate transaction records. A replay must match the authenticated actor, sender, recipient and integer amount. Global keys simplify compatibility with the tutorial index but should be random to avoid collisions. A duplicate-key race resolves to the winning committed request or a conflict. No email is sent again on a replay. Cross-user collisions reveal only a generic conflict, not the original transaction.

## Money and rollback
Amounts are positive safe integers in minor units, capped at one billion per transfer. Balance arithmetic is checked against JavaScript's safe integer range. Debit, credit and COMPLETED transaction commit together. An injected failure after the debit verifies that all writes, including account version increments, roll back. No PENDING transaction is exposed as if it had committed. Switching an existing deployment to minor units requires a real migration; this project requires a fresh database.

## Reliability and security
Email executes after commit and is optional. Failure is logged generically; response success describes committed funds. This is not durable delivery. Passwords are no longer printed, login normalizes email, cookies are HttpOnly/SameSite Strict (Secure in production), JWT verification pins HS256, and deleted users are rejected. Do not claim this provides complete production security.

## Questions to practise
- Why is a transaction alone insufficient to stop write skew?
- What exactly must be inside the MongoDB session?
- Why lock both accounts and use a stable ordering?
- What happens when a client retries after losing a success response?
- Why are monetary values stored in minor units?
- How would an outbox make notification delivery durable?
- How would you migrate existing balances and indexes safely?
- Which guarantees disappear if another service writes ledger entries directly?
