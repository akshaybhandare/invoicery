# Handover Log: Phase 4 (Purchases, Category Expenses, & File Attachments)

This document details the completed implementation of Phase 4 deliverables under **Story 4: Cash Flow Tracking (Purchases & Category-based Expenses)**.

---

## 🛠️ Accomplished in Phase 4

### 1. Purchases Logging & Stock Synchronization (`src/database.ts` & `src/server.ts`)
- **Backend Schema & Controllers**:
  - Implemented Purchases CRUD helpers: `getPurchases()`, `getPurchase(id)`, `createPurchase(purchase, items)`, and `deletePurchase(id)`.
  - Added a setting sequence sequence `purchase_next_number` starting at `1` to generate sequential `PUR-0000XX` keys.
- **Stock Management Integration**:
  - Creating a purchase automatically **increases** the stock levels of the corresponding product (`current_stock = current_stock + purchase_qty`).
  - Deleting a purchase automatically **deducts** the added stock levels.
- **API Routing**:
  - Exposed `GET /api/purchases`, `GET /api/purchases/next-number`, `GET /api/purchases/detail?id=...`, `POST /api/purchases`, and `DELETE /api/purchases` endpoints.

### 2. Category-based Expense Recorder
- **Backend Controllers**:
  - Implemented Expense CRUD: `getExpenses()`, `createExpense(expense)`, and `deleteExpense(id)`.
  - Categories are fully checked against check constraints: `Rent`, `Fuel`, `Electricity`, `Courier`, `Internet`, `Packing`, `Office Supplies`, `General`, `Salary`, `Travelling`.
  - Logs payment outflows to the global payments registry automatically.
- **API Routing**:
  - Exposed `GET /api/expenses`, `POST /api/expenses`, and `DELETE /api/expenses?id=...` endpoints.

### 3. Quick-Add Supplier Management
- **Suppliers Registry**:
  - Created `GET /api/suppliers` and `POST /api/suppliers` routes.
  - Added a quick-add form modal directly inside the Purchase registry to add new vendors on-the-fly without leaving the form.

### 4. Secure Local File Attachment Upload Utility
- **Multipart Form Upload Handler**:
  - Exposed `POST /api/upload` parsing files using Bun's native forms engine.
  - Filenames are sanitized using `path.basename()` and appended with unique timestamps (`<timestamp>_<clean_basename>`).
  - Saved securely to a local project directory: `./attachments/`.
- **Static Assets Mapping**:
  - Added a server routing handler to expose the `./attachments/*` directory as static resources, enabling inline browser link triggers (`📄 VIEW BILL` or `📄 VIEW RECEIPT`) directly from the tables.

---

## 🚀 How to Run & Verify

1. Run the local Bun server task:
   ```bash
   bun run src/server.ts
   ```
2. Navigate to **[http://localhost:3000/#purchases](http://localhost:3000/#purchases)**:
   - Click **`+ RECORD PURCHASE`**.
   - Click **`+ ADD`** next to the Supplier dropdown to register a new vendor.
   - Enter vendor details (default state matches Karnataka) and save. It automatically populates the dropdown.
   - Use the spreadsheet item grid to record purchased quantity and cost.
   - Select a bill receipt file using the upload field.
   - Click **`SAVE PURCHASE`**. Verify stock levels of the product increase under the **`PRODUCTS`** tab!
3. Navigate to **[http://localhost:3000/#expenses](http://localhost:3000/#expenses)**:
   - Click **`+ RECORD EXPENSE`**.
   - Fill category, amount, date, and payment mode.
   - Select a receipt file and save.
   - Verify it lists correctly in the table with a clickable link to view the receipt.
