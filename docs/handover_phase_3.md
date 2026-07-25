# Phase 3 Handover: Sales Invoices & GST Auto-calculation Engine

This document details the database, server, UI styling, and GSTR validation tests implemented for Story 3.

---

## 🛠️ Components Developed

### 1. Database Layer (`src/database.ts`)
- **`getNextInvoiceNumber()`**: Generates sequential invoice identifiers based on settings, zero-padded to 6 digits (e.g. `INV-000001`).
- **`createInvoice(inv, items)`**: Atomically inserts invoice header, subtracts item quantities from product inventory stocks, inserts line items, and increments the invoice settings sequence inside a transaction block.
- **`getInvoices()`**: Retrieves invoices sorted chronologically.
- **`getInvoice(id)`**: Fetches details for a single invoice, joining customer info and items list.
- **`deleteInvoice(id)`**: Removes invoice document and restores corresponding product inventory stocks.
- **`updateInvoiceStatus(id, status)`**: Modifies document status.

### 2. REST API Routes (`src/server.ts`)
- `GET /api/invoices` -> List of invoices.
- `GET /api/invoices/next-number` -> Sequence counter checker.
- `GET /api/invoices/detail?id=id` -> Detail payload matching JS structures.
- `POST /api/invoices` -> Submit invoices, validate schemas, trigger transaction stock updates.
- `DELETE /api/invoices?id=id` -> Delete document.
- `PUT /api/invoices/status` -> Modify status.

### 3. Front-End Layouts & Styles (`public/index.html`, `public/style.css`, & `public/app.js`)
- **Invoice List Tab**: Tracks past transactions with responsive Pumice styling. Added **PAID** and **BALANCE DUE** columns directly to the grid.
- **Invoice Payments & Balance Tracking**:
  - Newly created sales invoices default to **Confirmed** (unpaid).
  - Added a **`PAY`** action button dynamically visible in the dashboard grid when there is a remaining balance due.
  - Implemented a **Record Payment Modal** to log payment dates, amounts, payment methods (UPI, Cash, Bank Transfer, Cheque, Card), transaction reference IDs, and notes.
  - On payment submission, the transaction-safe SQL handler inserts a row into the `payments` table and automatically advances the invoice status to `Partially Paid` or `Paid` depending on the cumulative payments recorded.
- **Invoice Editor Modal**:
  - Auto-selects Place of Supply to match customer profile on choice.
  - **Inline HSN & GST Slabs Override**: Grid rows contain editable HSN input fields and a dropdown select for GST slabs (0%, 5%, 12%, 18%, 28%). Product selection sets defaults, but users can customize either parameter per-product directly in the line.
  - Spreadsheet item grid: dynamically appends rows, auto-fills rates/unit on product selection.
  - **KeyboardTraversals**: Pressing `Enter` in the grid inputs focuses the next cell, and on the last row automatically creates a new row.
- **Tax Splits**:
  - Karnataka local supply (Place of Supply code `29`): CGST = `Rate/2`, SGST = `Rate/2`, IGST = 0.
  - Interstate supply (other than `29`): CGST = 0, SGST = 0, IGST = `Rate`.
- **A4 Print Layout Preview**:
  - **Embedded Logo**: Embedded `/logo.jpg` image dynamically in the top header.
  - **Consumer (Unregistered) Display**: If a customer has no GSTIN recorded, the GSTIN row is completely hidden from the printed layout to keep it clean.
  - **Inline Tax splits per product row**: Displays CGST %, CGST amount, SGST %, and SGST amount (or IGST %/Amt for inter-state) directly on the same row as the product inside the items table.
  - **Pagination (Multi-page Print)**: Added print style rules to repeat table headers (`thead { display: table-header-group; }`) on multi-page overflows and prevent individual item rows from breaking across page breaks.
  - Displays **Amount Paid** and **Balance Due** indicators dynamically matching payment states.
  - Embedded HSN-wise tax summary table (standard GSTR compliance).
  - Hide background layers during `window.print()` using CSS `@media print` queries.

---

## 🚀 How to Run & Verify

1. Run the local bun server (running as a background task):
   ```bash
   bun run src/server.ts
   ```
2. Navigate to **[http://localhost:3000/#invoices](http://localhost:3000/#invoices)**.
3. Click **`+ CREATE INVOICE`**:
   - Choose a customer from the dropdown. Notice how the Place of Supply automatically matches.
   - Select a product. Notice description, unit, and prices auto-populating.
   - Type quantity. Notice real-time tax calculation, local splits, and grand totals updating.
   - Press `Enter` to spawn a new row immediately.
4. Click **`SAVE & CONFIRM INVOICE`**. The sequence counter increments to the next serial.
5. Click **`PRINT`** on any row to open the A4 print sheet containing invoice headers and the HSN tax breakdown.
