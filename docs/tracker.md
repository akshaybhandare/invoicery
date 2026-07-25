# Project Tracker: Personal Billing & GST Assistant

This tracker outlines the user stories, tasks, and completion statuses for the Personal Billing & GST Assistant. All documentation is maintained in the `docs/` folder.

---

## 📋 Status Overview
* **Overall Progress**: 100%
* **Current Phase**: All Phases Completed Successfully!
* **Target OS/Runtime**: macOS/Bun

---

## 🛠️ User Stories & Tasks

### 🎬 Story 1: Project Setup & Local Server Bootstrap
**Goal**: Initialize the project directory, setup a Bun-native development server, create the SQLite schema, initialize Karnataka default configurations, and build the Single Page Application base layout with a premium dark mode theme.

* [x] **Task 1.1: Project Initialization**
  * Define `package.json`, set up Bun configuration, and define startup scripts.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_1.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_1.md)
* [x] **Task 1.2: SQLite Database Schema Creation**
  * Create `database.ts` using native `bun:sqlite` to initialize `billing.db`.
  * Define schemas for: `settings`, `gst_rates`, `customers`, `suppliers`, `products`, `invoices`, `invoice_items`, `purchases`, `purchase_items`, `expenses`, `payments`, `attachments`.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_1.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_1.md)
* [x] **Task 1.3: Settings Initialization**
  * Auto-insert Karnataka state code (`29`) as default business state.
  * Set default prefix `INV-` and sequence start to `1` in `settings` table.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_1.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_1.md)
* [x] **Task 1.4: Native Bun Web Server (`server.ts`)**
  * Create high-performance HTTP server using `Bun.serve`.
  * Handle static files routing (`/` served from `public/index.html` and assets).
  * Build REST API routing helper framework (safely processing JSON requests and handling exceptions without leaking trace details).
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_1.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_1.md)
* [x] **Task 1.5: UI Frame & Shell Layout**
  * Build modern, responsive HTML page with sidebar navigation using Vanilla CSS (vibrant dark mode, high-contrast dashboard elements, Google Fonts Inter).
  * Set up Single Page App client-side routing logic (dynamic tab switching via Vanilla JS without page reloads).
  * Implement general API status indicator.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_1.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_1.md)

---

### 🎬 Story 2: Master Data Management (Customers & Products)
**Goal**: Build APIs and UI panels to manage customers and products, enforcing the default local state of Karnataka.

* [x] **Task 2.1: Customer Backend APIs**
  * Implement CRUD endpoints: `GET /api/customers`, `POST /api/customers`, `PUT /api/customers`, `DELETE /api/customers`.
  * Add an autocomplete/search endpoint for quick billing suggestions.
  * *Status*: Complete
  * *Handover Note*: Completed inside [src/database.ts](file:///Users/akshaybhandare/3D/GST/myZoho/src/database.ts) and [src/server.ts](file:///Users/akshaybhandare/3D/GST/myZoho/src/server.ts), verified via REST requests.
* [x] **Task 2.2: Customer Frontend Panel**
  * Build customer listing table with search filter.
  * Build a clean modal form for adding/editing customers (defaulting state to Karnataka, validation of GSTIN format).
  * *Status*: Complete
  * *Handover Note*: Implemented in [public/index.html](file:///Users/akshaybhandare/3D/GST/myZoho/public/index.html), [public/style.css](file:///Users/akshaybhandare/3D/GST/myZoho/public/style.css), and [public/app.js](file:///Users/akshaybhandare/3D/GST/myZoho/public/app.js) with state selector sync and auto GSTIN extraction.
* [x] **Task 2.3: Product Backend APIs**
  * Implement CRUD endpoints: `GET /api/products`, `POST /api/products`, `PUT /api/products`, `DELETE /api/products`.
  * Set up SKU validation and inventory status tracker.
  * *Status*: Complete
  * *Handover Note*: Completed in [src/database.ts](file:///Users/akshaybhandare/3D/GST/myZoho/src/database.ts) and [src/server.ts](file:///Users/akshaybhandare/3D/GST/myZoho/src/server.ts), verified via REST requests.
* [x] **Task 2.4: Product Frontend Panel**
  * Build product catalog grid with filters.
  * Create product entry form capturing SKU, HSN/SAC code, price, and default GST rates (dropdown: 0%, 5%, 12%, 18%, 28%).
  * *Status*: Complete
  * *Handover Note*: Implemented in [public/index.html](file:///Users/akshaybhandare/3D/GST/myZoho/public/index.html), [public/style.css](file:///Users/akshaybhandare/3D/GST/myZoho/public/style.css), and [public/app.js](file:///Users/akshaybhandare/3D/GST/myZoho/public/app.js) with dynamic GST rate loading and validation.

---

### 🎬 Story 3: Invoice Generation & Karnataka GST Calculation Engine
**Goal**: Implement the core invoice generation form with keyboard-first navigation, auto-incrementing serials, and automatic CGST/SGST/IGST tax split based on state code.

* [x] **Task 3.1: Sequential Invoice Number Generator**
  * Write a thread-safe helper to fetch the next sequential number formatted as `INV-0000XX` (e.g. `INV-000001`), incrementing the counter on invoice confirmation.
  * *Status*: Completed
  * *Handover Note*: Created `getNextInvoiceNumber` query helper and incremented settings key `invoice_next_number` in SQLite transaction block.
* [x] **Task 3.2: Keyboard-First Invoice Grid UI**
  * Build invoice editor: Select customer, invoice date, place of supply (defaults to Karnataka).
  * Implement a spreadsheet-style items table (Enter key adds new row, Tab traverses cells, inline fuzzy search for products).
  * *Status*: Completed
  * *Handover Note*: Programmed a table spreadsheet widget with live search populator, custom tab traverses, and enter key row instantiations.
* [x] **Task 3.3: GST Calculation Logic**
  * Build frontend/backend calculation engine:
    * If Customer State Code is `29` (Karnataka) -> CGST = `Rate/2`, SGST = `Rate/2`, IGST = 0.
    * If Customer State Code is not `29` -> CGST = 0, SGST = 0, IGST = `Rate`.
  * Display totals section in real-time: Taxable Value, Total CGST, Total SGST, Total IGST, Round Off, Grand Total.
  * *Status*: Completed
  * *Handover Note*: Programmed local vs interstate tax splits, real-time totals rounding logic, and transaction bounds.
* [x] **Task 3.4: Invoice PDF & Print Layout**
  * Design a print-friendly invoice invoice layout (A4 size, clean table structures, business details header, signatures line, HSN tax summary footer).
  * *Status*: Completed
  * *Handover Note*: Created an overlay print modal that structures the metadata, line items, and a grouped HSN-wise tax summary table for A4 screen printing.

---

### 🎬 Story 4: Cash Flow Tracking (Purchases & Category-based Expenses)
**Goal**: Allow logging of purchase invoices (incoming supplies/input tax credit) and operating expenses, supporting offline local file uploads.

* [x] **Task 4.1: Purchases API & UI**
  * Create Purchase module to log supplier bills: Supplier name, Invoice number, Date, Total amount, and Input GST.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_4.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_4.md)
* [x] **Task 4.2: Expenses API & UI**
  * Build category-based expense recorder: Rent, Fuel, Electricity, Courier, Internet, Packing, Office Supplies, etc.
  * Log expense amount, payment mode, date, and optional GST component.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_4.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_4.md)
* [x] **Task 4.3: Secure Local Attachment Upload Utility**
  * Build file upload handler. Clean uploaded filenames using `path.basename()`, assign unique IDs, and save securely in a local `attachments/` folder.
  * Link attachments to purchases/expenses.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_4.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_4.md)

---

### 🎬 Story 5: Financial Intelligence & Backup Utilities
**Goal**: Complete the system with a cash/payment registry, GST summary reports matching government schemas, dashboard charts, and physical backup controls.

* [x] **Task 5.1: Payments & Ledger System**
  * Record customer invoice receipts and supplier payouts.
  * Track outstanding balances on customer profiles.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_5.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_5.md)
* [x] **Task 5.2: Dashboard Metrics & Profit Charts**
  * Implement active widgets: Daily/Monthly Sales, Monthly Expenses, Outstanding Receivables/Payables.
  * Draw visual SVG line charts for profit trends and category-wise expense distributions.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_5.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_5.md)
* [x] **Task 5.3: GST Filing Report Summaries**
  * Generate GSTR-1 matching sections (B2B, B2C Small, B2C Large, and HSN-wise table summaries).
  * Generate GSTR-3B summaries (Table 3.1 supplies, Table 4 eligible Input Tax Credit (ITC)).
  * Display a monthly GST net liability summary (Output GST - Input GST = Net GST Payable).
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_5.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_5.md)
* [x] **Task 5.4: Database Backup & Restore Utility**
  * Implement download button to package the SQLite file and `attachments/` directory into a `.zip` archive.
  * Implement restore selector to upload the zip, unpack, and resume operation.
  * *Status*: Completed
  * *Handover Note*: Refer to [handover_phase_5.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/handover_phase_5.md)
