# Validation status

Verified on 2026-10-07 UTC.

- All 14 tests passed on GitHub Actions with Node.js 22 / Ubuntu: four validation tests and ten API integration tests using a real MongoDB 7.0.24 replica set.
- Both push and pull-request runs passed for implementation commit f66c27fb8960c8dda50b155b0851a83e64d5b7fd.
- Verified concurrency cases: competing 700-unit transfers against a 1000-unit balance permit exactly one; five identical simultaneous requests create exactly one transfer.
- Verified rollback: an injected failure after the debit insert leaves no partial transaction or ledger postings and restores the account version write.
- Also covered ownership, idempotency conflicts, amount validation, currency/status checks, email failure isolation, registration, login, cookie flags, logout and deleted-user rejection.
- JavaScript syntax and diff whitespace checks passed locally. Four validation tests also passed locally on Node.js 24.19.0.
- Local MongoDB startup was blocked by environment permissions; GitHub Actions supplied the successful real-database validation.
- Docker runtime, actual SMTP delivery and a public API deployment have not been tested.

Evidence: https://github.com/geeky-nikhil/geeky-bank/actions/runs/37673088979

These regression tests cover the specified scenarios; they are not a production-security or banking-compliance certification.
