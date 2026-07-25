# Phase 2 Handover: Master Data Management (Customers & Products)

This document details the completed components for **Phase 2** (Master Data Management) and lists the steps to launch and verify the implementation.

---

## 🏗️ What was implemented in Phase 2

1. **Customer & Product Backend APIs** ([src/database.ts](file:///Users/akshaybhandare/3D/GST/myZoho/src/database.ts) & [src/server.ts](file:///Users/akshaybhandare/3D/GST/myZoho/src/server.ts)):
    - **Customer CRUD Endpoints**: Added `GET /api/customers`, `POST /api/customers`, `PUT /api/customers`, `DELETE /api/customers`, and a dynamic auto-incrementing `GET /api/customers/next-id` endpoint.
   - **Product CRUD Endpoints**: Added `GET /api/products`, `POST /api/products`, `PUT /api/products`, and `DELETE /api/products`.
   - **Search Autocomplete**: Added `/api/customers/search?q=value` and `/api/products/search?q=value` search endpoints for dynamic filtering.
   - **GST Rates Endpoint**: Exposed `/api/gst-rates` to dynamically fetch standard tax bands seeded in the database.
   - **Data Validation & Business Rules**:
     - Mandatory field verification (requires `id` and `name` on creation).
     - Strict **Indian GSTIN Format Regex Validation**: Checks formatting of customer GSTIN (e.g. `29AAAAA0000A1Z5`) and blocks mismatched codes with a `400 Bad Request`.
     - **State Code Validation**: Blocks mismatches where the selected state code does not align with the first two digits of the customer's GSTIN.
     - **Safety Checks**: Blocks deletion of customers that are associated with existing sales invoices. Archiving of products sets `is_active = 0` to preserve historical invoice traces.

2. **Master listings & Modal Forms UI** ([public/index.html](file:///Users/akshaybhandare/3D/GST/myZoho/public/index.html), [public/style.css](file:///Users/akshaybhandare/3D/GST/myZoho/public/style.css), & [public/app.js](file:///Users/akshaybhandare/3D/GST/myZoho/public/app.js)):
   - **Caldera Design Integration**:
     - Floating Limestone navigation container with Bebas Neue typography.
     - Clean responsive tables with `1.5px dotted` borders and hover states on warm Pumice gray canvas.
     - Fully responsive inputs with `100px` radius (pill-shaped form fields).
     - Centered **Limestone Modal Overlays** (`40px` radius) with Obsidian backdrop-blur shading to prevent thread blocking.
     - Custom error notifications in forms (does NOT use native browser `alert()` popups inside forms, complying with security standards).
    - **Dynamic UI Sync & UX Actions**:
      - **Customer ID Auto-population**: Launching the Add Customer modal fetches the next sequential customer identifier (`CUST-0000XX`) and sets it automatically.
      - **Same as Billing Address Link**: Added a checkbox toggle in the shipping address field. Checking it copies the Billing Address value instantly, makes the field read-only, and dynamically propagates updates as the user types.
      - Adding a customer defaults the dropdown selection to **Karnataka** (State code `29`).
      - Typing a GSTIN automatically extracts the first two digits, matches it to the state list, and auto-selects the corresponding Billing State.
      - Selecting a state dynamically updates the readonly State Code field.
      - Dynamic loading of seeded GST rate dropdowns in the product modal.
      - Secure DOM text nodes (`textContent`) for XSS sanitization.

---

## 🚀 How to Run & Verify

Follow these steps to test the Phase 2 implementation:

### Step 1: Start the Local Server
If the server is stopped, navigate to the workspace `/Users/akshaybhandare/3D/GST/myZoho` and run:
```bash
bun run dev
```

### Step 2: Test Customer APIs & UI
1. Navigate to: `http://localhost:3000/#customers`
2. Click **`+ ADD CUSTOMER`** to open the centered Limestone modal.
3. Try entering an invalid GSTIN (like `12345`) and click **SAVE**. You will see the custom red error banner appear in the form.
4. Type a valid GSTIN starting with `27` (e.g., `27AAAAA1111A1Z5`). The state select dropdown will auto-select **Maharashtra (27)**.
5. Try changing the Billing State back to **Karnataka (29)** while leaving the Maharashtra GSTIN. Click **SAVE**; the backend will block it due to state mismatch.
6. Fix the fields and click **SAVE**. The customer row will render in the responsive table.
7. Click **EDIT** on the customer row. The fields will populate with the Customer ID locked to readonly.

### Step 3: Test Product Catalog
1. Navigate to: `http://localhost:3000/#products`
2. Click **`+ ADD PRODUCT`** to open the product modal.
3. Observe that the **GST Rate** select dropdown lists the standard seeded tax bands (0%, 5%, 12%, 18%, 28%) dynamically.
4. Enter values, click **SAVE**, and verify that the row renders in the catalog table.
5. Click **EDIT** or **ARCHIVE** to manage catalog listings.

---

## 🧪 Terminal Verification Commands (Curl Scripts)

You can run these curl requests in a separate terminal window to verify database operations:

```bash
# 1. Create a Customer record (should succeed 201)
curl -X POST -H "Content-Type: application/json" \
  -d '{"id":"CUST-TEST-02","name":"Test Client","gstin":"29BBBBB2222B1Z5","state":"Karnataka","state_code":"29"}' \
  http://127.0.0.1:3000/api/customers

# 2. Add a Product item (should succeed 201)
curl -X POST -H "Content-Type: application/json" \
  -d '{"id":"PROD-TEST-02","sku":"PROD-TEST-02","name":"Keyboard","hsn_sac_code":"8471","gst_rate_id":4,"unit":"PCS","purchase_price":300,"selling_price":500}' \
  http://127.0.0.1:3000/api/products

# 3. Retrieve list (verify records are in SQLite)
curl http://127.0.0.1:3000/api/customers
curl http://127.0.0.1:3000/api/products
```
