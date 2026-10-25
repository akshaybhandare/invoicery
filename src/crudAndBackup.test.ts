import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { 
  db,
  dbPath,
  initializeDatabase,
  getSettings,
  createCustomer,
  getCustomers,
  updateCustomer,
  deleteCustomer,
  createProduct,
  getProducts,
  updateProduct,
  adjustProductStock,
  archiveProduct,
  createSupplier,
  getSuppliers,
  createInvoice,
  updateInvoice,
  getInvoice,
  getInvoices,
  deleteInvoice,
  updateInvoiceStatus,
  recordPayment,
  createPurchase,
  getPurchases,
  deletePurchase,
  createExpense,
  getExpenses,
  deleteExpense,
  reopenDatabase
} from "./database";

describe("Database Path & Full CRUD & Backup Verification", () => {
  beforeAll(() => {
    initializeDatabase();
    db.run("DELETE FROM products WHERE id LIKE 'TEST-%';");
    db.run("DELETE FROM customers WHERE id LIKE 'TEST-%';");
  });

  afterAll(() => {
    db.run("DELETE FROM products WHERE id LIKE 'TEST-%';");
    db.run("DELETE FROM customers WHERE id LIKE 'TEST-%';");
  });

  // 1. Verify Database Path
  test("Database path should point to data/billing.db by default", () => {
    expect(dbPath).toContain("data");
    expect(dbPath).toContain("billing.db");
  });

  // 2. Customer CRUD Operations
  describe("Customer CRUD", () => {
    const testCustId = "TEST-CUST-CRUD-1";

    test("Create & Read Customer", () => {
      createCustomer({
        id: testCustId,
        name: "Test Customer Corp",
        gstin: "29DBAPB4400H1Z7",
        phone: "9999999999",
        email: "test@example.com",
        state: "Karnataka",
        state_code: "29"
      });

      const customers = getCustomers() as any[];
      const found = customers.find(c => c.id === testCustId);
      expect(found).toBeDefined();
      expect(found.name).toBe("Test Customer Corp");
    });

    test("Update Customer", () => {
      updateCustomer(testCustId, {
        name: "Test Customer Corp Updated",
        gstin: "29DBAPB4400H1Z7",
        phone: "8888888888",
        state: "Karnataka",
        state_code: "29"
      });

      const customers = getCustomers() as any[];
      const found = customers.find(c => c.id === testCustId);
      expect(found.name).toBe("Test Customer Corp Updated");
    });

    test("Delete Customer", () => {
      deleteCustomer(testCustId);
      const customers = getCustomers() as any[];
      const found = customers.find(c => c.id === testCustId);
      expect(found).toBeUndefined();
    });
  });

  // 3. Product CRUD & Stock Adjustments
  describe("Product CRUD", () => {
    const testProdId = "TEST-PROD-CRUD-1";

    test("Create & Read Product", () => {
      const gstRates = db.query("SELECT id FROM gst_rates WHERE rate = 18.0;").get() as { id: number };
      createProduct({
        id: testProdId,
        sku: testProdId,
        name: "Test Widget 18%",
        gst_rate_id: gstRates.id,
        unit: "PCS",
        purchase_price: 100.0,
        selling_price: 200.0,
        current_stock: 50.0
      });

      const products = getProducts() as any[];
      const found = products.find(p => p.id === testProdId);
      expect(found).toBeDefined();
      expect(found.selling_price).toBe(200.0);
    });

    test("Adjust Product Stock", () => {
      const newStock = adjustProductStock(testProdId, 25);
      expect(newStock).toBe(75.0);
    });

    test("Update Product", () => {
      const gstRates = db.query("SELECT id FROM gst_rates WHERE rate = 18.0;").get() as { id: number };
      updateProduct(testProdId, {
        sku: testProdId,
        name: "Updated Widget 18%",
        gst_rate_id: gstRates.id,
        unit: "PCS",
        purchase_price: 120.0,
        selling_price: 240.0
      });

      const products = getProducts() as any[];
      const found = products.find(p => p.id === testProdId);
      expect(found.name).toBe("Updated Widget 18%");
    });

    test("Archive Product", () => {
      archiveProduct(testProdId);
      const products = getProducts() as any[];
      const found = products.find(p => p.id === testProdId);
      expect(found).toBeUndefined(); // Active products list excludes archived
    });
  });

  // 4. Supplier & Purchase CRUD
  describe("Supplier & Purchase CRUD", () => {
    let supplierId: number;

    test("Create Supplier", () => {
      createSupplier({
        name: "Test Supplier Ltd",
        gstin: "29AAAAA0000A1Z5",
        phone: "7777777777",
        state: "Karnataka",
        state_code: "29"
      });

      const suppliers = getSuppliers() as any[];
      const found = suppliers.find(s => s.name === "Test Supplier Ltd");
      expect(found).toBeDefined();
      supplierId = found.id;
    });

    test("Create & Read Purchase", () => {
      // Create product for purchase
      const gstRates = db.query("SELECT id FROM gst_rates WHERE rate = 18.0;").get() as { id: number };
      createProduct({
        id: "TEST-PUR-PROD",
        name: "Purchase Test Prod",
        gst_rate_id: gstRates.id,
        unit: "PCS",
        purchase_price: 50.0,
        selling_price: 100.0,
        current_stock: 10.0
      });

      createPurchase(
        {
          id: "TEST-PUR-001",
          supplier_id: supplierId,
          supplier_invoice_number: "SUP-INV-99",
          invoice_date: "2026-07-26",
          taxable_amount: 500.0,
          total_gst: 90.0,
          grand_total: 590.0,
          payment_status: "Unpaid"
        },
        [
          {
            product_id: "TEST-PUR-PROD",
            quantity: 10,
            unit_price: 50.0,
            taxable_value: 500.0,
            gst_rate: 18.0,
            gst_amount: 90.0,
            total_amount: 590.0
          }
        ]
      );

      const purchases = getPurchases() as any[];
      const found = purchases.find(p => p.id === "TEST-PUR-001");
      expect(found).toBeDefined();
      expect(found.grand_total).toBe(590.0);

      // Verify stock auto-incremented (+10 to initial 10 = 20)
      const prod = db.query("SELECT current_stock FROM products WHERE id = 'TEST-PUR-PROD';").get() as { current_stock: number };
      expect(prod.current_stock).toBe(20.0);
    });

    test("Delete Purchase", () => {
      deletePurchase("TEST-PUR-001");
      const purchases = getPurchases() as any[];
      const found = purchases.find(p => p.id === "TEST-PUR-001");
      expect(found).toBeUndefined();

      // Clean up test product
      db.run("DELETE FROM products WHERE id = 'TEST-PUR-PROD';");
      db.run("DELETE FROM suppliers WHERE id = ?;", [supplierId]);
    });
  });

  // 5. Invoice & Payment CRUD
  describe("Invoice & Payment CRUD", () => {
    const invId = "TEST-INV-CRUD-99";
    const custId = "TEST-INV-CUST-99";
    const prodId = "TEST-INV-PROD-99";

    beforeAll(() => {
      createCustomer({
        id: custId,
        name: "Invoice Test Cust",
        state: "Karnataka",
        state_code: "29"
      });

      const gstRates = db.query("SELECT id FROM gst_rates WHERE rate = 18.0;").get() as { id: number };
      createProduct({
        id: prodId,
        name: "Invoice Test Item",
        gst_rate_id: gstRates.id,
        unit: "PCS",
        selling_price: 1000.0,
        current_stock: 100.0
      });
    });

    test("Create Invoice & Stock Deduction", () => {
      createInvoice(
        {
          id: invId,
          invoice_date: "2026-07-26",
          customer_id: custId,
          place_of_supply: "Karnataka",
          online_order_number: "ORD-999888",
          notes: "CRUD test invoice",
          taxable_value: 1000.0,
          cgst_amount: 90.0,
          sgst_amount: 90.0,
          igst_amount: 0.0,
          round_off: 0.0,
          grand_total: 1180.0,
          status: "Confirmed"
        },
        [
          {
            product_id: prodId,
            product_name: "Invoice Test Item",
            quantity: 5,
            unit: "PCS",
            unit_price: 1000.0,
            taxable_value: 1000.0,
            gst_rate: 18.0,
            cgst_amount: 90.0,
            sgst_amount: 90.0,
            igst_amount: 0.0,
            total_amount: 1180.0
          }
        ]
      );

      const invDetail = getInvoice(invId);
      expect(invDetail).toBeDefined();
      expect(invDetail?.invoice.grand_total).toBe(1180.0);
      expect(invDetail?.invoice.online_order_number).toBe("ORD-999888");

      // Verify stock auto-deducted (100 - 5 = 95)
      const prod = db.query("SELECT current_stock FROM products WHERE id = ?;").get(prodId) as { current_stock: number };
      expect(prod.current_stock).toBe(95.0);
    });

    test("Update Invoice & Stock Adjustment", () => {
      updateInvoice(
        {
          id: invId,
          invoice_date: "2026-07-27",
          customer_id: custId,
          place_of_supply: "Maharashtra",
          online_order_number: "ORD-MODIFIED",
          notes: "Updated CRUD test invoice",
          taxable_value: 400.0,
          cgst_amount: 0.0,
          sgst_amount: 0.0,
          igst_amount: 72.0,
          round_off: 0.0,
          grand_total: 472.0,
          status: "Confirmed"
        },
        [
          {
            product_id: prodId,
            product_name: "Invoice Test Item",
            quantity: 2,
            unit: "PCS",
            unit_price: 200.0,
            taxable_value: 400.0,
            gst_rate: 18.0,
            cgst_amount: 0.0,
            sgst_amount: 0.0,
            igst_amount: 72.0,
            total_amount: 472.0
          }
        ]
      );

      const invDetail = getInvoice(invId);
      expect(invDetail).toBeDefined();
      expect(invDetail?.invoice.grand_total).toBe(472.0);
      expect(invDetail?.invoice.online_order_number).toBe("ORD-MODIFIED");
      expect(invDetail?.invoice.place_of_supply).toBe("Maharashtra");
      expect(invDetail?.invoice.invoice_date).toBe("2026-07-27");
      expect(invDetail?.items.length).toBe(1);
      expect(invDetail?.items[0].quantity).toBe(2);

      // Verify stock adjusted: was 95 (100 - 5), now should be 98 (100 - 2)
      const prod = db.query("SELECT current_stock FROM products WHERE id = ?;").get(prodId) as { current_stock: number };
      expect(prod.current_stock).toBe(98.0);
    });

    test("Record Payment & Update Invoice Status", () => {
      recordPayment({
        invoice_number: invId,
        amount: 472.0,
        payment_date: "2026-07-26",
        payment_method: "UPI",
        reference_number: "UPI123456",
        notes: "Full payment test"
      });

      const invDetail = getInvoice(invId);
      expect(invDetail?.invoice.status).toBe("Paid");
      expect(invDetail?.invoice.paid_amount).toBe(472.0);
    });

    test("Delete Invoice & Restore Stock", () => {
      deleteInvoice(invId);
      const invDetail = getInvoice(invId);
      expect(invDetail).toBeNull();

      // Verify stock restored (98 + 2 = 100)
      const prod = db.query("SELECT current_stock FROM products WHERE id = ?;").get(prodId) as { current_stock: number };
      expect(prod.current_stock).toBe(100.0);

      // Clean up
      db.run("DELETE FROM products WHERE id = ?;", [prodId]);
      db.run("DELETE FROM customers WHERE id = ?;", [custId]);
    });
  });

  // 6. Expense CRUD
  describe("Expense CRUD", () => {
    let expenseId: number;

    test("Create Expense", () => {
      expenseId = createExpense({
        category: "Rent",
        amount: 15000.0,
        gst_amount: 0.0,
        expense_date: "2026-07-26",
        payment_method: "Bank Transfer",
        notes: "Office rent test"
      });

      expect(expenseId).toBeGreaterThan(0);
      const expenses = getExpenses() as any[];
      const found = expenses.find(e => e.id === expenseId);
      expect(found).toBeDefined();
      expect(found.amount).toBe(15000.0);
    });

    test("Delete Expense", () => {
      deleteExpense(expenseId);
      const expenses = getExpenses() as any[];
      const found = expenses.find(e => e.id === expenseId);
      expect(found).toBeUndefined();
    });
  });
});
