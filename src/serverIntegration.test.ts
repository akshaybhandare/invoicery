import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import "./server";
import { db } from "./database";

describe("API Integration & UX Validation Test Suite", () => {
  const BASE_URL = "http://localhost:3000";
  const TEST_API_KEY = "mz_api_integration_test_secret_998877";

  let originalSettings: Record<string, string> = {};

  beforeAll(async () => {
    // 1. Back up original settings
    const rows = db.query("SELECT key, value FROM settings;").all() as { key: string; value: string }[];
    for (const row of rows) {
      originalSettings[row.key] = row.value;
    }

    // 2. Set business settings for clean integration tests
    db.prepare("UPDATE settings SET value = 'TEST Business' WHERE key = 'business_name';").run();
    db.prepare("UPDATE settings SET value = '29DBAPB4400H1Z7' WHERE key = 'business_gstin';").run();
    db.prepare("UPDATE settings SET value = 'Karnataka' WHERE key = 'business_state';").run();
    db.prepare("UPDATE settings SET value = '29' WHERE key = 'business_state_code';").run();

    // 3. Create test records directly in the DB
    // Create customers
    db.prepare(`
      INSERT OR REPLACE INTO customers (id, name, state, state_code, country)
      VALUES ('TEST-CUST-INTRA', 'Local Customer', 'Karnataka', '29', 'India');
    `).run();
    db.prepare(`
      INSERT OR REPLACE INTO customers (id, name, state, state_code, country)
      VALUES ('TEST-CUST-INTER', 'Out of State Customer', 'Maharashtra', '27', 'India');
    `).run();

    // Create suppliers
    db.prepare(`
      INSERT OR REPLACE INTO suppliers (id, name, state, state_code)
      VALUES (999, 'TEST-SUPPLIER', 'Karnataka', '29');
    `).run();

    // Create products
    // Ensure we have GST rates seeded
    const rates = db.query("SELECT id FROM gst_rates WHERE rate = 18.0;").get() as { id: number } | null;
    const rate18Id = rates ? rates.id : 4;
    const rate5Id = (db.query("SELECT id FROM gst_rates WHERE rate = 5.0;").get() as { id: number } | null)?.id || 2;

    db.prepare(`
      INSERT OR REPLACE INTO products (id, sku, name, gst_rate_id, unit, selling_price, purchase_price, current_stock)
      VALUES ('TEST-PROD-18', 'TEST-PROD-18', '18% Product', ?, 'PCS', 1000.0, 600.0, 50.0);
    `).run(rate18Id);

    db.prepare(`
      INSERT OR REPLACE INTO products (id, sku, name, gst_rate_id, unit, selling_price, purchase_price, current_stock)
      VALUES ('TEST-PROD-5', 'TEST-PROD-5', '5% Product', ?, 'PCS', 2000.0, 1500.0, 30.0);
    `).run(rate5Id);
  });

  afterAll(async () => {
    // Restore original settings
    for (const key of Object.keys(originalSettings)) {
      db.prepare("UPDATE settings SET value = ? WHERE key = ?;").run(originalSettings[key], key);
    }

    // Clean up test records
    db.run("DELETE FROM payments WHERE notes LIKE '%TEST-%' OR notes LIKE '%Auto-recorded%';");
    db.run("DELETE FROM invoice_items WHERE invoice_number LIKE 'TEST-%';");
    db.run("DELETE FROM invoices WHERE invoice_number LIKE 'TEST-%';");
    db.run("DELETE FROM purchase_items WHERE purchase_number LIKE 'TEST-%';");
    db.run("DELETE FROM purchases WHERE purchase_number LIKE 'TEST-%';");
    db.run("DELETE FROM products WHERE id LIKE 'TEST-%';");
    db.run("DELETE FROM customers WHERE id LIKE 'TEST-%';");
    db.run("DELETE FROM suppliers WHERE id = 999;");
  });

  // =========================================================================
  // 1. API Enabled/Disabled and Key Authentication Tests
  // =========================================================================
  describe("API Authentication Security", () => {
    test("Should return 403 Forbidden when API is disabled", async () => {
      db.prepare("UPDATE settings SET value = 'false' WHERE key = 'api_enabled';").run();

      const response = await fetch(`${BASE_URL}/api/external/status`, {
        headers: { "x-api-key": TEST_API_KEY }
      });
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain("disabled");
    });

    test("Should return 401 Unauthorized when API is enabled but key is missing", async () => {
      db.prepare("UPDATE settings SET value = 'true' WHERE key = 'api_enabled';").run();
      db.prepare("UPDATE settings SET value = ? WHERE key = 'api_key';").run(TEST_API_KEY);

      const response = await fetch(`${BASE_URL}/api/external/status`);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toContain("Unauthorized");
    });

    test("Should return 401 Unauthorized when API key is incorrect", async () => {
      db.prepare("UPDATE settings SET value = 'true' WHERE key = 'api_enabled';").run();
      db.prepare("UPDATE settings SET value = ? WHERE key = 'api_key';").run(TEST_API_KEY);

      const response = await fetch(`${BASE_URL}/api/external/status`, {
        headers: { "x-api-key": "wrong_key_here" }
      });
      expect(response.status).toBe(401);
    });

    test("Should return 200 OK when API key matches (x-api-key header)", async () => {
      db.prepare("UPDATE settings SET value = 'true' WHERE key = 'api_enabled';").run();
      db.prepare("UPDATE settings SET value = ? WHERE key = 'api_key';").run(TEST_API_KEY);

      const response = await fetch(`${BASE_URL}/api/external/status`, {
        headers: { "x-api-key": TEST_API_KEY }
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe("OK");
    });

    test("Should return 200 OK when API key matches (Authorization Bearer header)", async () => {
      db.prepare("UPDATE settings SET value = 'true' WHERE key = 'api_enabled';").run();
      db.prepare("UPDATE settings SET value = ? WHERE key = 'api_key';").run(TEST_API_KEY);

      const response = await fetch(`${BASE_URL}/api/external/status`, {
        headers: { "Authorization": `Bearer ${TEST_API_KEY}` }
      });
      expect(response.status).toBe(200);
    });
  });

  // =========================================================================
  // 2. Customer UX Form Validations (State Match & GSTIN formats)
  // =========================================================================
  describe("Customer UX Validations", () => {
    test("Create customer with invalid GSTIN format should fail", async () => {
      const response = await fetch(`${BASE_URL}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "TEST-CUST-BAD",
          name: "Bad Customer",
          gstin: "123456", // Invalid format
          state_code: "29"
        })
      });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("Invalid GSTIN format");
    });

    test("Create customer with state code mismatch with GSTIN first 2 digits should fail", async () => {
      const response = await fetch(`${BASE_URL}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "TEST-CUST-MISMATCH",
          name: "Mismatched State Customer",
          gstin: "27DBAPB4400H1Z7", // Maharashtra prefix (27)
          state_code: "29" // Karnataka code (29)
        })
      });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("does not match selected State Code");
    });
  });

  // =========================================================================
  // 3. Tax Calculations & Rounding (Intrastate vs Interstate vs Multi-item)
  // =========================================================================
  describe("External API Invoice Tax Logic", () => {
    beforeAll(() => {
      db.prepare("UPDATE settings SET value = 'true' WHERE key = 'api_enabled';").run();
      db.prepare("UPDATE settings SET value = ? WHERE key = 'api_key';").run(TEST_API_KEY);
    });

    test("Intrastate Invoice (CGST & SGST)", async () => {
      // Intrastate: Merchant is 29, Customer (TEST-CUST-INTRA) is 29
      const response = await fetch(`${BASE_URL}/api/external/invoices`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice: {
            customer_id: "TEST-CUST-INTRA",
            invoice_number: "TEST-INV-LOCAL",
            status: "Paid"
          },
          items: [
            {
              product_id: "TEST-PROD-18",
              quantity: 2, // 2 * 1000.0 = 2000.0 taxable value
              unit_price: 1000.0
            }
          ]
        })
      });

      expect(response.status).toBe(201);
      const res = await response.json();
      expect(res.success).toBe(true);
      expect(res.invoice.taxable_value).toBe(2000.0);
      expect(res.invoice.cgst_amount).toBe(180.0); // 9% of 2000
      expect(res.invoice.sgst_amount).toBe(180.0); // 9% of 2000
      expect(res.invoice.igst_amount).toBe(0.0);
      expect(res.invoice.grand_total).toBe(2360.0); // 2000 + 180 + 180
    });

    test("Interstate Invoice (IGST only)", async () => {
      // Interstate: Merchant is 29, Customer (TEST-CUST-INTER) is 27
      const response = await fetch(`${BASE_URL}/api/external/invoices`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice: {
            customer_id: "TEST-CUST-INTER",
            invoice_number: "TEST-INV-OUTSTATE",
            status: "Paid"
          },
          items: [
            {
              product_id: "TEST-PROD-18",
              quantity: 3, // 3 * 1000.0 = 3000.0 taxable value
              unit_price: 1000.0
            }
          ]
        })
      });

      expect(response.status).toBe(201);
      const res = await response.json();
      expect(res.success).toBe(true);
      expect(res.invoice.taxable_value).toBe(3000.0);
      expect(res.invoice.cgst_amount).toBe(0.0);
      expect(res.invoice.sgst_amount).toBe(0.0);
      expect(res.invoice.igst_amount).toBe(540.0); // 18% of 3000
      expect(res.invoice.grand_total).toBe(3540.0); // 3000 + 540
    });

    test("Multi-Item Multiple Rate Combination Invoices", async () => {
      // Mix of 18% Product and 5% Product
      const response = await fetch(`${BASE_URL}/api/external/invoices`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice: {
            customer_id: "TEST-CUST-INTRA",
            invoice_number: "TEST-INV-MIXED",
            status: "Draft"
          },
          items: [
            {
              product_id: "TEST-PROD-18",
              quantity: 1, // 1 * 1000.0 = 1000.0 @ 18% (CGST 90, SGST 90)
              unit_price: 1000.0
            },
            {
              product_id: "TEST-PROD-5",
              quantity: 2, // 2 * 2000.0 = 4000.0 @ 5% (CGST 100, SGST 100)
              unit_price: 2000.0
            }
          ]
        })
      });

      expect(response.status).toBe(201);
      const res = await response.json();
      expect(res.success).toBe(true);
      expect(res.invoice.taxable_value).toBe(5000.0); // 1000 + 4000
      expect(res.invoice.cgst_amount).toBe(190.0); // 90 + 100
      expect(res.invoice.sgst_amount).toBe(190.0); // 90 + 100
      expect(res.invoice.igst_amount).toBe(0.0);
      expect(res.invoice.grand_total).toBe(5380.0); // 5000 + 190 + 190
    });
  });

  // =========================================================================
  // 4. Inventory UX Flow (Automatic stock adjustments)
  // =========================================================================
  describe("Inventory UX stock flow", () => {
    test("Invoice creation deducts inventory stock level", async () => {
      // Query initial stock
      const prodBefore = db.prepare("SELECT current_stock FROM products WHERE id = 'TEST-PROD-18';").get() as { current_stock: number };
      const initialStock = prodBefore.current_stock;

      // Sell 10 items
      const response = await fetch(`${BASE_URL}/api/external/invoices`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice: { customer_id: "TEST-CUST-INTRA", invoice_number: "TEST-INV-STOCK" },
          items: [{ product_id: "TEST-PROD-18", quantity: 10, unit_price: 1000.0 }]
        })
      });

      expect(response.status).toBe(201);
      
      const prodAfter = db.prepare("SELECT current_stock FROM products WHERE id = 'TEST-PROD-18';").get() as { current_stock: number };
      expect(prodAfter.current_stock).toBe(initialStock - 10);
    });

    test("Purchase recording increments inventory stock level", async () => {
      // Query initial stock
      const prodBefore = db.prepare("SELECT current_stock FROM products WHERE id = 'TEST-PROD-18';").get() as { current_stock: number };
      const initialStock = prodBefore.current_stock;

      // Buy 30 items
      const response = await fetch(`${BASE_URL}/api/external/purchases`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          purchase: { supplier_id: 999, purchase_number: "TEST-PUR-STOCK" },
          items: [{ product_id: "TEST-PROD-18", quantity: 30, unit_price: 600.0 }]
        })
      });

      expect(response.status).toBe(201);
      
      const prodAfter = db.prepare("SELECT current_stock FROM products WHERE id = 'TEST-PROD-18';").get() as { current_stock: number };
      expect(prodAfter.current_stock).toBe(initialStock + 30);
    });
  });

  // =========================================================================
  // 5. Edge cases & Validations
  // =========================================================================
  describe("API Input Boundary & Validation Failures", () => {
    test("Create invoice with non-existent product should fail", async () => {
      const response = await fetch(`${BASE_URL}/api/external/invoices`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice: { customer_id: "TEST-CUST-INTRA", invoice_number: "TEST-INV-FAIL1" },
          items: [{ product_id: "NON_EXISTENT_PROD_SKU", quantity: 1, unit_price: 100.0 }]
        })
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("not found");
    });

    test("Create invoice with non-existent customer should fail", async () => {
      const response = await fetch(`${BASE_URL}/api/external/invoices`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice: { customer_id: "NON_EXISTENT_CUSTOMER_ID", invoice_number: "TEST-INV-FAIL2" },
          items: [{ product_id: "TEST-PROD-18", quantity: 1, unit_price: 100.0 }]
        })
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("not found");
    });

    test("Create invoice with zero or negative quantity should fail", async () => {
      const response = await fetch(`${BASE_URL}/api/external/invoices`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice: { customer_id: "TEST-CUST-INTRA", invoice_number: "TEST-INV-FAIL3" },
          items: [{ product_id: "TEST-PROD-18", quantity: -5, unit_price: 100.0 }]
        })
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("must be greater than 0");
    });

    test("Create product with duplicate SKU / ID should fail", async () => {
      const response = await fetch(`${BASE_URL}/api/external/products`, {
        method: "POST",
        headers: {
          "x-api-key": TEST_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "TEST-PROD-18", // Already exists
          name: "Duplicate Product Name",
          gst_rate: 18.0
        })
      });

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.error).toContain("already exists");
    });
  });
});
