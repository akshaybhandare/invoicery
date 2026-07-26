# Invoicery — Code Audit Report

> **Date:** 2026-07-26  
> **Scope:** Full codebase review — `src/server.ts`, `src/database.ts`, `src/gstr1Generator.ts`, Docker/Compose, `public/`  
> **Severity legend:** 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low / Improvement

---

## 1. Definite Bugs / Points of Failure

### 🔴 BUG-01 — `zipPath` is never declared

**File:** `src/server.ts:1177`

```ts
// zipPath is referenced three times but never defined anywhere in the file
const proc = spawnSync("zip", ["-r", "-q", zipPath, relDbPath, "attachments"]);
const file = Bun.file(zipPath);
try { unlinkSync(zipPath); } catch (e) {}
```

**Impact:** Every call to `GET /api/backup` throws a `ReferenceError` at runtime — the backup feature is completely broken.

**Fix:** Add this at the top of the backup handler:
```ts
const zipPath = "/tmp/invoicery_backup.zip";
```

---

### 🔴 BUG-02 — `require()` inside an ES Module

**File:** `src/server.ts:1221`

```ts
const { db } = require("./database"); // import reference
```

The project uses `"type": "module"` (ESM). `require()` is not available in ESM and will throw `ReferenceError: require is not defined`. This is inside the restore handler, meaning restore will always crash at this line after the DB has already been closed — leaving it in a permanently broken state.

**Fix:** Remove this line entirely — `db` is already imported at the top of the file via `import { db, ... }`.

---

### 🔴 BUG-03 — Settings key mismatch: `biz_gst` vs `business_gstin`

**File:** `src/server.ts:1101` vs `src/database.ts:273`

```ts
// server.ts — reads the WRONG key
const merchantGstin = settings.biz_gst || "";

// database.ts — seeds the CORRECT key
insertSetting.run("business_gstin", "");
```

`settings.biz_gst` will always be `undefined`, so `merchantGstin` is always `""`. Every GSTR-1 JSON export returns a **400 error** even when GSTIN is properly configured.

**Fix:** Change `settings.biz_gst` → `settings.business_gstin`.

---

### 🟠 BUG-04 — Restore handler uses `reopenDatabase()` as a close, then re-opens incorrectly

**File:** `src/server.ts:1220-1228`

```ts
reopenDatabase(); // This REOPENS the DB (not just closes it)
const { db } = require("./database"); // broken (see BUG-02), then db.close()
// ...
const proc = spawnSync("unzip", ["-o", "-q", restoreZipPath, "-d", "."]);
reopenDatabase(); // Re-open after unzip
```

`reopenDatabase()` closes the old handle **and immediately opens a new one**. The intent was: close → extract files → re-open. But the logic is inverted: the new connection is opened before unzip runs, so after unzip replaces the file on disk, the stale in-memory handle may point to the old inode.

**Fix:** Expose a `closeDatabase()` helper that only closes without re-opening. Use it before `unzip`, then call `reopenDatabase()` after.

---

### 🟠 BUG-05 — `updateSetting` accepts arbitrary keys (no allowlist)

**File:** `src/server.ts:379-390`

```ts
const body = await req.json();
for (const key of Object.keys(body)) {
  updateSetting(key, String(body[key]));
}
```

Any POST to `/api/settings/save` can write **any arbitrary key/value pair** to the settings table. There is no authentication on this endpoint and no allowlist of permitted keys. Anyone on the local network can overwrite `api_key`, flip `api_enabled`, or inject arbitrary data.

**Fix:** Validate `key` against an explicit allowlist before calling `updateSetting`.

---

### 🟠 BUG-06 — Stock deducted immediately on Draft invoice creation

**File:** `src/database.ts:580`

```ts
// Inside createInvoice transaction — runs for ALL statuses including 'Draft'
db.prepare("UPDATE products SET current_stock = current_stock - ? WHERE id = ?;")
  .run(item.quantity, item.product_id);
```

Stock is decremented at the moment of creation, regardless of invoice status. Deleting a Draft correctly restores stock, but cancelling a Draft by status change does not. Inventory figures will silently drift.

**Fix:** Only deduct stock on transition `Draft → Confirmed` (or direct `Confirmed`/`Paid` creation). Restore on cancellation.

---

### 🟠 BUG-07 — Partially Paid purchase auto-records 50% as payment amount

**File:** `src/database.ts:771`

```ts
const payAmount = pur.payment_status === 'Paid' ? pur.grand_total : pur.grand_total / 2; // Simple default
```

If a purchase is `Partially Paid`, exactly 50% of the grand total is recorded as a payment with no way to specify the actual amount. Payments ledger and payables dashboard metric will be inaccurate.

**Fix:** Accept an optional `paid_amount` on the purchase payload; only auto-record a payment when `payment_status === 'Paid'`.

---

### 🟡 BUG-08 — `getNextCustomerId` relies on lexicographic sort (not numeric)

**File:** `src/database.ts:495`

```ts
const row = db.query("SELECT id FROM customers WHERE id LIKE 'CUST-%' ORDER BY id DESC LIMIT 1;").get()
```

SQLite `ORDER BY id DESC` on a `TEXT` column sorts lexicographically. The 6-digit zero-padding mitigates this within the normal range, but any non-padded or out-of-band ID insertion corrupts the sequence.

**Fix:** Use `ORDER BY CAST(SUBSTR(id, 6) AS INTEGER) DESC` or maintain a counter in settings (like invoices do).

---

### 🟡 BUG-09 — `initSchema` inconsistently mixes `targetDb` and `db` proxy

**File:** `src/database.ts:81-91`

```ts
export function initSchema() {
  const targetDb = realDb || db;
  targetDb.run(`CREATE TABLE IF NOT EXISTS settings ...`); // uses targetDb
  db.run(`CREATE TABLE IF NOT EXISTS gst_rates ...`);      // switches to db proxy
  // ... all subsequent tables also use db proxy
```

Only the first table creation uses `targetDb`. If called before `realDb` is set, the `db` proxy will throw `"Database file does not exist yet"`.

**Fix:** Use `targetDb` consistently throughout `initSchema`.

---

### 🟡 BUG-10 — Date inputs for `from`/`to` query params are not validated

**File:** `src/server.ts:973-975`

```ts
} else if (from && to) {
  fromDate = from;  // passed directly into SQL BETWEEN
  toDate = to;
}
```

A malformed date like `"not-a-date"` will silently return empty results rather than an error.

**Fix:** Validate format with `/^\d{4}-\d{2}-\d{2}$/` before use.

---

### 🟡 BUG-11 — File upload has no MIME type or extension allowlist

**File:** `src/server.ts:897-914`

```ts
const cleanName = basename(file.name);  // prevents path traversal only
await writeFile(absolutePath, Buffer.from(bytes));  // saves any file type
```

`basename()` prevents directory traversal, but any file type (`.html`, `.sh`, `.exe`) can be stored. If served without `Content-Disposition`, stored HTML could execute as XSS.

**Fix:** Allowlist accepted MIME types (`image/jpeg`, `image/png`, `application/pdf`) and validate file extension.

---

## 2. Resilience & Operational Concerns

### 🟠 RES-01 — SQLite WAL mode not enabled

**File:** `src/database.ts:38`

```ts
realDb.run("PRAGMA foreign_keys = ON;");
// Missing: PRAGMA journal_mode = WAL;
```

The default journal mode (`DELETE`) locks the entire database file during writes. WAL mode allows readers and writers to operate concurrently, reducing `SQLITE_BUSY` errors under any load.

**Fix:** Add `realDb.run("PRAGMA journal_mode = WAL;");` immediately after opening the database.

---

### 🟠 RES-02 — No SQLite `synchronous` or `cache_size` tuning

With default `synchronous = FULL` and no cache tuning, write performance under Docker on a volume mount can be significantly degraded. With WAL enabled, `synchronous = NORMAL` is safe and meaningfully faster.

**Fix:** Add `realDb.run("PRAGMA synchronous = NORMAL;");` and consider `PRAGMA cache_size = -8000;` (8 MB).

---

### 🟠 RES-03 — `zip`/`unzip` binaries not installed in Alpine Docker image

**File:** `Dockerfile`

Alpine does **not** include `zip` or `unzip` by default. The backup and restore endpoints will silently fail in Docker.

**Fix:** Add to the Dockerfile:
```dockerfile
RUN apk add --no-cache zip
```
Or replace the `spawnSync` calls with a pure Bun/JS zip library to eliminate the OS dependency.

---

### 🟠 RES-04 — No request size limit on file upload or restore

`file.arrayBuffer()` in both `POST /api/upload` and `POST /api/restore` fully buffers the upload into memory before writing to disk. A large file could cause an OOM crash.

**Fix:** Check `Content-Length` header and reject requests above a configurable limit (e.g., 50 MB for backups, 10 MB for attachments).

---

### 🟠 RES-05 — No authentication on internal API endpoints

All internal API routes (`/api/customers`, `/api/invoices`, `/api/reports/gst`, etc.) are completely unauthenticated. The Docker Compose file binds to `0.0.0.0:3000`, exposing these on the entire local network.

**Fix:** At minimum, add a simple session token or `INTERNAL_API_KEY` environment variable check, especially for destructive operations (DELETE, restore, settings).

---

### 🟡 RES-06 — Invoice counter has potential read-modify-write race

**File:** `src/database.ts:601-603`

```ts
const currentNumRow = db.query("SELECT value FROM settings WHERE key = 'invoice_next_number';").get()
const currentNum = ...
db.prepare("UPDATE settings SET value = ? ...").run(String(currentNum + 1));
```

This is inside a transaction (good), but `getNextInvoiceNumber()` reads the counter **outside** the transaction to return to the client. Two concurrent requests can read the same counter value before either commits, potentially producing duplicate invoice numbers.

**Fix:** Read and increment the counter inside the same transaction, and only return the committed value.

---

### 🟡 RES-07 — Payments ledger party name lookup always fails for customers

**File:** `src/database.ts:1080`

```sql
-- customers.id is TEXT like 'CUST-000001', but this casts to INTEGER → always 0
(SELECT name FROM customers WHERE id = CAST(p.party_id AS INTEGER))
```

The `CAST` converts `'CUST-000001'` to `0`, so the subquery never matches. Every inbound payment shows `'Customer ID ...'` instead of the actual customer name.

**Fix:** Remove the `CAST` — compare `party_id` directly as TEXT: `WHERE id = p.party_id`.

---

### 🟡 RES-08 — GST ITC calculation hardcodes state code `'29'` (Karnataka)

**File:** `src/database.ts:1036-1038`, `1284-1286`

```sql
CASE WHEN s.state_code = '29' THEN p.total_gst / 2.0 ...
```

Any business not registered in Karnataka (state `29`) will get incorrect CGST/SGST ITC split on GSTR-3B.

**Fix:** Read `business_state_code` from settings at query time and pass it as a parameter.

---

### 🟡 RES-09 — `adjustProductStock` allows negative stock silently

**File:** `src/database.ts:480`

```ts
db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id = ?;").run(delta, productId);
```

A negative delta can drive `current_stock` below zero with no warning or error.

**Fix:** Add `CHECK (current_stock >= -999999)` as a soft floor, or return a warning in the API response when stock goes negative.

---

### 🟡 RES-10 — Backup uses relative paths; breaks if CWD is not the project root

**File:** `src/server.ts:1175-1177`

```ts
const relDbPath = relative(process.cwd(), dbPath);
const proc = spawnSync("zip", ["-r", "-q", zipPath, relDbPath, "attachments"]);
```

`"attachments"` is a bare relative path. If the process starts from a different directory, the attachments folder will not be included. Silent, incomplete backups.

**Fix:** Pass absolute paths and use the `cwd` option in `spawnSync`:
```ts
spawnSync("zip", ["-r", "-q", zipPath, relDbPath, attachmentsAbsPath], { cwd: process.cwd() });
```

---

## 3. Code Quality & Maintainability

### 🔵 CODE-01 — Date-range parsing logic duplicated 3×

The month/quarter/date-range parsing block is copy-pasted verbatim three times across `src/server.ts` (lines 938, 990, 1048). Any fix must be made in three places.

**Fix:** Extract into a shared `parsePeriodParams(url: URL)` helper function.

---

### 🔵 CODE-02 — `server.ts` and `database.ts` are 1,200+ line monoliths

`server.ts` handles routing, static file serving, backup/restore, and all API logic. `database.ts` handles schema, CRUD, analytics, GST calculations, and filing reports. These responsibilities should be split into modules (e.g., `routes/`, `services/`, `reports/`).

---

### 🔵 CODE-03 — Pervasive `any` types in the database layer

Nearly every function parameter (`c: any`, `p: any`, `sup: any`, `exp: any`) is typed as `any`. This defeats TypeScript's type safety.

**Fix:** Define interfaces: `Customer`, `Product`, `Invoice`, `Purchase`, `Expense`, `Supplier`.

---

### 🔵 CODE-04 — GSTR-1 JSON uses incorrect `version` string

**File:** `src/gstr1Generator.ts:362`

```ts
version: "INVOICERY"
```

The GSTN portal expects a specific version string (e.g., `"GST3.0.4"`). A custom string may cause portal submission validation to fail.

**Fix:** Use the current GSTN-mandated version string or omit the field.

---

### 🔵 CODE-05 — `doc_issue` assumes contiguous invoice numbering

**File:** `src/gstr1Generator.ts:341-353`

The `doc_issue` section reports a single sequence from the first to the last invoice number. Deleted invoices leave gaps, so `totnum` (count of invoices in period) will not match the from/to range, which the GSTN portal may flag.

**Fix:** Report only the actual count and note gaps, or enumerate individual sequences.

---

## 4. Infrastructure / Deployment

### 🟠 INFRA-01 — No Docker health check

**File:** `docker-compose.yml`

Docker considers the container healthy immediately after process start, even if the server is still initializing.

**Fix:**
```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/status"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

---

### 🟠 INFRA-02 — `zip`/`unzip` not in Alpine image

See RES-03. The backup and restore are silently non-functional in Docker deployments.

```dockerfile
RUN apk add --no-cache zip
```

---

### 🔵 INFRA-03 — No resource limits in Docker Compose

No `mem_limit` or `cpus`. A runaway report query or large backup/restore could starve the host.

---

### 🔵 INFRA-04 — Confirm `data/` and `attachments/` are gitignored

Any accidental `git add .` would commit the production SQLite database and all uploaded financial documents to the repository.

---

## 5. Summary Table

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| BUG-01 | 🔴 Critical | Runtime Bug | `zipPath` undefined — backup always crashes |
| BUG-02 | 🔴 Critical | Runtime Bug | `require()` in ESM — restore always crashes |
| BUG-03 | 🔴 Critical | Logic Bug | Wrong settings key — GSTR-1 export always returns 400 |
| BUG-04 | 🟠 High | Logic Bug | Restore DB state machine is inverted; leaves DB broken |
| BUG-05 | 🟠 High | Security | Settings endpoint writes any key with no auth or allowlist |
| BUG-06 | 🟠 High | Logic Bug | Stock deducted on Draft creation, not on Confirm |
| BUG-07 | 🟠 High | Logic Bug | Hardcoded 50% payment amount for Partially Paid purchases |
| BUG-08 | 🟡 Medium | Logic Bug | Customer ID sequence uses lexicographic sort |
| BUG-09 | 🟡 Medium | Logic Bug | `initSchema` inconsistently mixes `targetDb` and `db` |
| BUG-10 | 🟡 Medium | Validation | Date query params not validated before SQL use |
| BUG-11 | 🟡 Medium | Security | File upload accepts any file type |
| RES-01 | 🟠 High | Resilience | SQLite WAL mode not enabled — writer blocks readers |
| RES-02 | 🟠 High | Resilience | No SQLite synchronous/cache tuning |
| RES-03 | 🟠 High | Resilience | `zip`/`unzip` not installed in Alpine Docker image |
| RES-04 | 🟠 High | Resilience | No request size limit on uploads/restore (OOM risk) |
| RES-05 | 🟠 High | Security | No auth on internal API — all endpoints open on LAN |
| RES-06 | 🟡 Medium | Resilience | Invoice counter read-modify-write race potential |
| RES-07 | 🟡 Medium | Logic Bug | Party ID CAST breaks customer name in payments ledger |
| RES-08 | 🟡 Medium | Logic Bug | GST ITC hardcodes state code '29' (Karnataka only) |
| RES-09 | 🟡 Medium | Resilience | Stock can go negative with no warning |
| RES-10 | 🟡 Medium | Resilience | Backup uses relative paths; silently incomplete if CWD is wrong |
| CODE-01 | 🔵 Low | Quality | Date-range parsing duplicated 3× across server.ts |
| CODE-02 | 🔵 Low | Quality | 1200-line monolithic files; hard to navigate and test |
| CODE-03 | 🔵 Low | Quality | Pervasive `any` types defeat TypeScript safety |
| CODE-04 | 🔵 Low | Logic Bug | GSTR-1 `version` string wrong — portal may reject JSON |
| CODE-05 | 🔵 Low | Logic Bug | `doc_issue` assumes contiguous invoice sequence |
| INFRA-01 | 🟠 High | Infra | No Docker health check |
| INFRA-02 | 🟠 High | Infra | `zip`/`unzip` missing from Alpine image |
| INFRA-03 | 🔵 Low | Infra | No memory/CPU limits in Docker Compose |
| INFRA-04 | 🔵 Low | Infra | Ensure `data/` and `attachments/` are gitignored |

---

## 6. Recommended Fix Order

1. **BUG-01, BUG-02, BUG-03** — Three one-liner fixes that restore three completely broken features (backup, restore, GSTR-1 export).
2. **INFRA-02 / RES-03** — Add `zip` to the Dockerfile; all Docker backup/restore is broken without it.
3. **BUG-04** — Fix the restore DB state machine to not leave the app in an unrecoverable state.
4. **RES-01 + RES-02** — Enable WAL mode and tune synchronous; biggest reliability uplift for the DB layer.
5. **RES-07** — Fix payments ledger party name lookup (silent display bug on the ledger page for all users).
6. **BUG-05, RES-05** — Security hardening before any network exposure beyond localhost.
7. **BUG-06, BUG-07, RES-08** — Business logic correctness for financial data integrity.
8. **CODE-01, CODE-03** — Refactoring for long-term maintainability.
