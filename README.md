# Backend Ledger: transaction safety extensions

An educational Node.js, Express and MongoDB banking API based on [Ankur Prajapati's backend-ledger](https://github.com/ankurdotio/backend-ledger) and the Sheryians Coding School advanced backend tutorial. Original tutorial authorship and Git history are preserved. The extensions in this version were developed with Codex assistance for Nikhil's portfolio.

## Added in this version

- Sender ownership checks and system-only initial funding.
- Atomic debit/credit postings with MongoDB transactions, retry handling and session cleanup.
- Writes to both account version fields before reading balances, so competing transfers conflict and retry instead of overspending from the same snapshot.
- Request-bound idempotency: identical retries return the original transfer; reuse by another user or with a different payload returns 409.
- Positive integer minor-unit amounts, self-transfer rejection, account/currency validation and balance range checks.
- Password-log removal, HttpOnly/SameSite cookies, deleted-user token rejection and bounded JSON bodies.
- Optional, best-effort email: SMTP failure cannot reverse a committed transfer or make its API response report failure.
- Automated unit and replica-set integration tests, GitHub Actions, environment examples and a Dockerfile.

## Run

Requires Node.js 22+ and MongoDB configured as a replica set (or MongoDB Atlas). A standalone MongoDB instance does not support this transaction flow.

```sh
npm ci
cp .env.example .env
# Set MONGO_URI to your fresh development database and generate JWT_SECRET.
npm start
```

PowerShell: use `Copy-Item .env.example .env` instead of `cp` if preferred. The API listens on PORT, default 3000. Email is disabled by default. Do not enter real banking credentials or real money.

**Compatibility change:** `amount` and reported balances are integer minor units: INR 100.00 is `10000` paise. Start with a fresh database; existing tutorial values are not migrated automatically. Existing transactions also lack the new `initiatedBy` field and cannot be replayed as new-format requests. Do not point this version at an existing populated database without a reviewed migration and index audit.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | `{name,email,password}`; creates a regular user |
| POST | `/api/auth/login` | `{email,password}`; returns token and protected cookie |
| POST | `/api/auth/logout` | Revokes supplied token |
| POST | `/api/accounts` | Creates an account for the authenticated user |
| GET | `/api/accounts` | Lists the user's accounts |
| GET | `/api/accounts/balance/:accountId` | Reads an owned account balance in minor units |
| POST | `/api/transactions` | Transfers between active accounts of the same currency |
| POST | `/api/transactions/system/initial-funds` | System-only demo funding |

Use `Authorization: Bearer <token>` or the login cookie. Transfer body:

```json
{"fromAccount":"<24-character account ID>","toAccount":"<24-character account ID>","amount":10000,"idempotencyKey":"transfer-example-001"}
```

An initial-funds request omits `fromAccount`; the service selects the system user's first active account. System users must be provisioned by a trusted database administrator; registration never grants this privilege. Initial funding permits a negative treasury balance to model demo issuance, while keeping matching debit and credit entries. It is not a payment gateway or a deposit verification system.

## Tests

```sh
npm run test:unit
npm test
```

Full tests start an isolated MongoDB 7.0.24 replica set with mongodb-memory-server. The first run downloads a MongoDB binary. They cover concurrent overspending, simultaneous duplicate requests, rollback after a debit write, ownership, invalid inputs, frozen accounts, currency mismatch, SMTP failure, authentication and logout.

See [validation status](docs/VALIDATION.md) for what has actually run, and [implementation guide](docs/CONTRIBUTIONS.md) for the design and trade-offs.

## Deployment

Publishing this repository to GitHub does not host the API. For a Node/container host, use `npm ci --omit=dev` and `npm start`, configure a replica-set MongoDB URI, a random JWT secret and `NODE_ENV=production`, and serve over HTTPS. A Dockerfile is included but has not been runtime-tested in this environment.

## Limits and attribution

This is an educational backend, not production banking software. Email is best effort (no durable outbox), JWT logout uses the tutorial blacklist, and login rate limiting, operational audit controls, migrations and disaster recovery remain future work. Ledger immutability middleware is an application guard; it cannot stop administrators or direct database writes. All ledger mutations must follow the account-locking service protocol for its concurrency guarantee to hold. High-contention accounts and repeated balance aggregation trade throughput for clarity and correctness.

Upstream `package.json` declares ISC; no separate upstream license text was present in the inspected revision `b6bbfc5d54772103a8a2ccadf956fb27bcb3fa2b`. That declaration is preserved without inventing a copyright notice or claiming sole authorship.
