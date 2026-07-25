# Invoicery ── Boutique Self-Hosted Invoicing & GST Assistant

An elegant, offline-first, self-hosted billing dashboard, expense ledger, and Indian GST filing assistant. Designed to be lightweight, secure, and run completely locally on your machine. Built with **Bun**, **SQLite**, and **Vanilla JavaScript/CSS**.

---

## Key Features

* **Self-Hosted & Offline-First:** Runs entirely on your local machine with zero external cloud dependencies. Your business data stays *yours*.
* **Modern, Sleek Dashboard:** A premium, dark-themed user interface displaying real-time analytics (sales, expenses, outstanding balances) and SVG-based analytics charts.
* **Frictionless Invoicing:** Quickly create, issue, and manage professional sales invoices. Automatically calculates and applies GST (CGST/SGST/IGST) based on the place of supply.
* **Automated Indian GST Summaries:** Classifies and formats sales data for **GSTR-1** (B2B, B2CL, B2CS, CDNR, CDNUR, Export, SEZ) and **GSTR-3B** return prep.
* **Customer Ledgers & Outstanding Balances:** Maintain customer profiles, state codes, and track payment transactions directly.
* **Procurement & Expense Logs:** Track vendor purchases and everyday operating costs to calculate your net profit and input tax credits (ITC).
* **Robust API Engine:** Programmatic access for external integrations, secured via custom API key headers, to sync inventory, customers, and create invoices.
* **One-Click Backup & Restore:** Instantly bundle your entire database (`billing.db`) and receipts (`attachments/`) into a single ZIP file, and restore it on any machine in seconds.

---

## Tech Stack

* **Runtime:** [Bun](https://bun.sh/) (v1.3.14) — for fast server start times and built-in TypeScript support.
* **Database:** SQLite via `bun:sqlite` (zero-configuration local file DB).
* **Frontend:** Vanilla HTML5, CSS3, and ES6 JavaScript (No bloated frameworks or bundlers required).

---

## Installation & Local Run

### Prerequisites

Ensure you have the [Bun runtime](https://bun.sh/) installed.
```bash
curl -fsSL https://bun.sh/install | bash
```

### Local Setup

1. **Clone the repository & enter the folder:**
   ```bash
   cd myZoho
   ```

2. **Install development types:**
   ```bash
   bun install
   ```

3. **Start the development server (with hot reloading):**
   ```bash
   bun run dev
   ```

4. **Start the production server:**
   ```bash
   bun run start
   ```

The application will bind to `127.0.0.1:3000` for security compliance, making it accessible at **[http://localhost:3000](http://localhost:3000)**.

---

## Docker Deployment (The Recommended Way to Freeze the App)

Docker containers provide the ultimate environment freeze. Running Invoicery via Docker guarantees it behaves exactly the same way forever, isolating the Bun runtime, SQLite libraries, and internal dependencies.

1. **Build and start the container in the background:**
   ```bash
   docker compose up -d --build
   ```
2. **Access Invoicery:**
   Open **[http://localhost:3000](http://localhost:3000)** in your browser.

3. **Database and Attachment Persistence:**
   The `docker-compose.yml` mounts local volumes so your invoice files and data are safely persisted in the host directory:
   * `./billing.db` ── The SQLite database file containing all structured tables and transactional records.
   * `./attachments/` ── Uploaded invoices, expenses, or purchase receipts.

4. **Stop the environment:**
   ```bash
   docker compose down
   ```

---

## Environment Variables

You can configure the server port and binding host using environment variables. These are set automatically in Docker, but can also be customized locally:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | The port the server listens on |
| `HOST` | `127.0.0.1` | The bind address. (Set to `0.0.0.0` for Docker/network access) |
| `NODE_ENV` | `production` | Production environment flag |

---

## Developer API Documentation

Invoicery includes a secure REST API for external integrations (e.g. connecting a mobile app, inventory scanner, or custom script).

### Authentication
All API endpoints require a custom header or bearer token. Configure your API key via the **Settings** panel in the UI.

* **API Key Header:** `x-api-key: your_api_key_here`
* **Bearer Token:** `Authorization: Bearer your_api_key_here`

### Key Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard` | Fetches dashboard summary cards and transaction metrics |
| `POST` | `/api/invoices` | Creates a new invoice and deducts product inventory stock |
| `POST` | `/api/purchases` | Registers a procurement invoice and increments product stock |
| `POST` | `/api/products/adjust` | Programmatic inventory adjustment |
| `GET` | `/api/backup` | Exports the database & attachments as a ZIP file |
| `POST` | `/api/restore` | Uploads a backup ZIP file and overwrites the active database |

---

## Test Suite

Verify system integrity by running the validation suite containing integration, tax logic, and UI structural checks:

```bash
bun test
```
