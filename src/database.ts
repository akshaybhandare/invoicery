import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { mkdirSync, existsSync, statSync } from "fs";

// Initialize/open database path (defaulting to data/billing.db)
export const dbPath = process.env.DB_PATH || join(process.cwd(), "data", "billing.db");

let realDb: Database | null = null;
export let isDbInitialized = false;

export function isDatabaseFileExisting(): boolean {
  if (!existsSync(dbPath)) {
    return false;
  }
  try {
    return !statSync(dbPath).isDirectory();
  } catch {
    return false;
  }
}

export function initializeDatabase() {
  if (realDb) return realDb;

  const dbDir = dirname(dbPath);
  if (dbDir && !existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  if (existsSync(dbPath) && statSync(dbPath).isDirectory()) {
    throw new Error(
      `SQLite Error: Unable to open database at "${dbPath}" because it is a directory.\n` +
      `If using Docker, ensure 'data' folder is mounted as a volume directory (e.g. './data:/app/data').`
    );
  }

  realDb = new Database(dbPath, { create: true });
  realDb.run("PRAGMA foreign_keys = ON;");
  isDbInitialized = true;
  initSchema();
  return realDb;
}

// Export db proxy so all imports `import { db }` continue working seamlessly
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    if (!realDb) {
      initializeDatabase();
    }
    const val = Reflect.get(realDb!, prop, receiver);
    if (typeof val === "function") {
      return val.bind(realDb);
    }
    return val;
  }
});

// Auto-initialize on server start ONLY if database file already exists
if (isDatabaseFileExisting()) {
  initializeDatabase();
}

export function reopenDatabase() {
  if (realDb) {
    try {
      realDb.close();
    } catch (e) {
      console.error("Error closing database connection during restore:", e);
    }
    realDb = null;
  }
  return initializeDatabase();
}

// Create schema tables
export function initSchema() {
  const targetDb = realDb || db;
  // 1. Settings Table
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 2. GST Rates Table
  db.run(`
    CREATE TABLE IF NOT EXISTS gst_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rate REAL UNIQUE NOT NULL,
      description TEXT
    );
  `);

  // 3. Customers Table
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gstin TEXT,
      pan TEXT,
      email TEXT,
      phone TEXT,
      billing_address TEXT,
      shipping_address TEXT,
      state TEXT DEFAULT 'Karnataka',
      state_code TEXT DEFAULT '29',
      country TEXT DEFAULT 'India',
      place_of_supply TEXT,
      contact_person TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Suppliers Table
  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gstin TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      state TEXT,
      state_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5. Products Table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT,
      name TEXT NOT NULL,
      description TEXT,
      hsn_sac_code TEXT,
      gst_rate_id INTEGER REFERENCES gst_rates(id),
      unit TEXT DEFAULT 'PCS',
      purchase_price REAL DEFAULT 0.0,
      selling_price REAL DEFAULT 0.0,
      current_stock REAL DEFAULT 0.0,
      reorder_level REAL DEFAULT 0.0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 6. Invoices Table
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      invoice_number TEXT PRIMARY KEY,
      invoice_date DATE NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      place_of_supply TEXT NOT NULL,
      payment_terms TEXT,
      due_date DATE,
      notes TEXT,
      taxable_amount REAL NOT NULL DEFAULT 0.0,
      total_cgst REAL DEFAULT 0.0,
      total_sgst REAL DEFAULT 0.0,
      total_igst REAL DEFAULT 0.0,
      round_off REAL DEFAULT 0.0,
      grand_total REAL NOT NULL DEFAULT 0.0,
      status TEXT NOT NULL CHECK (status IN ('Draft', 'Confirmed', 'Paid', 'Partially Paid', 'Cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 7. Invoice Items Table
  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL REFERENCES invoices(invoice_number) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT,
      hsn_sac_code TEXT,
      quantity REAL NOT NULL,
      unit TEXT,
      rate REAL NOT NULL,
      discount REAL DEFAULT 0.0,
      taxable_value REAL NOT NULL,
      gst_rate REAL NOT NULL,
      cgst REAL DEFAULT 0.0,
      sgst REAL DEFAULT 0.0,
      igst REAL DEFAULT 0.0,
      line_total REAL NOT NULL
    );
  `);

  // 8. Purchases Table
  db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      purchase_number TEXT PRIMARY KEY,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      supplier_invoice_number TEXT,
      invoice_date DATE,
      taxable_amount REAL DEFAULT 0.0,
      total_gst REAL DEFAULT 0.0,
      grand_total REAL DEFAULT 0.0,
      payment_status TEXT CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 9. Purchase Items Table
  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT NOT NULL REFERENCES purchases(purchase_number) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      quantity REAL NOT NULL,
      purchase_price REAL NOT NULL,
      taxable_value REAL NOT NULL,
      gst_rate REAL NOT NULL,
      gst_amount REAL NOT NULL,
      line_total REAL NOT NULL
    );
  `);

  // 10. Expenses Table
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date DATE NOT NULL,
      vendor TEXT,
      category TEXT NOT NULL CHECK (category IN ('Rent', 'Electricity', 'Internet', 'Fuel', 'Courier', 'Packing', 'Marketing', 'Office Supplies', 'Repairs', 'Miscellaneous')),
      amount REAL NOT NULL,
      gst_amount REAL DEFAULT 0.0,
      payment_method TEXT NOT NULL,
      notes TEXT,
      attachment_path TEXT
    );
  `);

  // 11. Payments Table
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
      party_id TEXT NOT NULL,
      invoice_number TEXT,
      amount REAL NOT NULL,
      payment_date DATE NOT NULL,
      payment_method TEXT NOT NULL,
      reference_number TEXT,
      notes TEXT
    );
  `);

  // 12. Attachments Table
  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('Purchase', 'Expense', 'Challan')),
      entity_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default settings if they do not exist
  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);");
  insertSetting.run("business_name", "My Personal Business");
  insertSetting.run("business_gstin", "");
  insertSetting.run("business_address", "Karnataka, India");
  insertSetting.run("business_city", "Bengaluru");
  insertSetting.run("business_logo_path", "");
  insertSetting.run("business_state", "Karnataka");
  insertSetting.run("business_state_code", "29");
  insertSetting.run("invoice_prefix", "INV-");
  insertSetting.run("invoice_next_number", "1");
  insertSetting.run("purchase_next_number", "1");
  insertSetting.run("api_enabled", "false");
  insertSetting.run("api_key", "");

  // Seed default GST rates if empty
  const countRates = db.query("SELECT COUNT(*) as count FROM gst_rates;").get() as { count: number };
  if (countRates.count === 0) {
    const insertRate = db.prepare("INSERT INTO gst_rates (rate, description) VALUES (?, ?);");
    insertRate.run(0.0, "Nil Rated / Exempt");
    insertRate.run(5.0, "Standard 5% GST");
    insertRate.run(12.0, "Standard 12% GST");
    insertRate.run(18.0, "Standard 18% GST");
    insertRate.run(28.0, "Standard 28% GST");
  }

  // Migration: Add hsn_sac_code column to invoice_items if it doesn't exist
  try {
    db.run("ALTER TABLE invoice_items ADD COLUMN hsn_sac_code TEXT;");
  } catch (e) {
    // Column already exists, ignore
  }
}

// Simple query helpers to avoid raw SQL boilerplate
export function getSettings() {
  const rows = db.query("SELECT key, value FROM settings;").all() as { key: string; value: string }[];
  const settingsObj: Record<string, string> = {};
  for (const row of rows) {
    settingsObj[row.key] = row.value;
  }
  if (settingsObj.api_enabled === undefined) settingsObj.api_enabled = "false";
  if (settingsObj.api_key === undefined) settingsObj.api_key = "";
  return settingsObj;
}

export function updateSetting(key: string, value: string) {
  const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value;");
  stmt.run(key, value);
}

export function getCustomers() {
  return db.query(`
    SELECT c.*,
           COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id), 0.0) -
           COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = CAST(c.id AS TEXT) AND direction = 'IN'), 0.0) as outstanding_balance
    FROM customers c
    ORDER BY c.name ASC;
  `).all();
}

export function searchCustomers(q: string) {
  const queryPattern = `%${q}%`;
  return db.query(`
    SELECT c.*,
           COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id), 0.0) -
           COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = CAST(c.id AS TEXT) AND direction = 'IN'), 0.0) as outstanding_balance
    FROM customers c
    WHERE c.name LIKE ? OR c.phone LIKE ? OR c.gstin LIKE ? 
    ORDER BY c.name ASC;
  `).all(queryPattern, queryPattern, queryPattern);
}

export function createCustomer(c: any) {
  const stmt = db.prepare(`
    INSERT INTO customers (id, name, gstin, pan, email, phone, billing_address, shipping_address, state, state_code, place_of_supply, contact_person, notes)
    VALUES ($id, $name, $gstin, $pan, $email, $phone, $billing_address, $shipping_address, $state, $state_code, $place_of_supply, $contact_person, $notes);
  `);
  return stmt.run({
    $id: c.id,
    $name: c.name,
    $gstin: c.gstin || null,
    $pan: c.pan || null,
    $email: c.email || null,
    $phone: c.phone || null,
    $billing_address: c.billing_address || null,
    $shipping_address: c.shipping_address || null,
    $state: c.state || "Karnataka",
    $state_code: c.state_code || "29",
    $place_of_supply: c.place_of_supply || null,
    $contact_person: c.contact_person || null,
    $notes: c.notes || null
  });
}

export function updateCustomer(id: string, c: any) {
  const stmt = db.prepare(`
    UPDATE customers SET
      name = $name,
      gstin = $gstin,
      pan = $pan,
      email = $email,
      phone = $phone,
      billing_address = $billing_address,
      shipping_address = $shipping_address,
      state = $state,
      state_code = $state_code,
      place_of_supply = $place_of_supply,
      contact_person = $contact_person,
      notes = $notes,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $id;
  `);
  return stmt.run({
    $id: id,
    $name: c.name,
    $gstin: c.gstin || null,
    $pan: c.pan || null,
    $email: c.email || null,
    $phone: c.phone || null,
    $billing_address: c.billing_address || null,
    $shipping_address: c.shipping_address || null,
    $state: c.state || "Karnataka",
    $state_code: c.state_code || "29",
    $place_of_supply: c.place_of_supply || null,
    $contact_person: c.contact_person || null,
    $notes: c.notes || null
  });
}

export function deleteCustomer(id: string) {
  const check = db.query("SELECT COUNT(*) as count FROM invoices WHERE customer_id = ?;").get(id) as { count: number };
  if (check.count > 0) {
    throw new Error("Cannot delete customer: they have active sales invoices.");
  }
  const stmt = db.prepare("DELETE FROM customers WHERE id = ?;");
  return stmt.run(id);
}

// --- Product Database Helpers ---
export function getProducts() {
  return db.query(`
    SELECT p.*, r.rate as gst_rate, r.description as gst_description 
    FROM products p
    LEFT JOIN gst_rates r ON p.gst_rate_id = r.id
    WHERE p.is_active = 1
    ORDER BY p.name ASC;
  `).all();
}

export function searchProducts(q: string) {
  const queryPattern = `%${q}%`;
  return db.query(`
    SELECT p.*, r.rate as gst_rate, r.description as gst_description
    FROM products p
    LEFT JOIN gst_rates r ON p.gst_rate_id = r.id
    WHERE p.is_active = 1 AND (p.name LIKE ? OR p.sku LIKE ?)
    ORDER BY p.name ASC;
  `).all(queryPattern, queryPattern);
}

export function createProduct(p: any) {
  const stmt = db.prepare(`
    INSERT INTO products (id, sku, name, description, hsn_sac_code, gst_rate_id, unit, purchase_price, selling_price, current_stock, reorder_level, is_active)
    VALUES ($id, $sku, $name, $description, $hsn_sac_code, $gst_rate_id, $unit, $purchase_price, $selling_price, $current_stock, $reorder_level, 1);
  `);
  return stmt.run({
    $id: p.id,
    $sku: p.sku || null,
    $name: p.name,
    $description: p.description || null,
    $hsn_sac_code: p.hsn_sac_code || null,
    $gst_rate_id: p.gst_rate_id,
    $unit: p.unit || "PCS",
    $purchase_price: p.purchase_price || 0.0,
    $selling_price: p.selling_price || 0.0,
    $current_stock: p.current_stock || 0.0,
    $reorder_level: p.reorder_level || 0.0
  });
}

export function updateProduct(id: string, p: any) {
  const stmt = db.prepare(`
    UPDATE products SET
      sku = $sku,
      name = $name,
      description = $description,
      hsn_sac_code = $hsn_sac_code,
      gst_rate_id = $gst_rate_id,
      unit = $unit,
      purchase_price = $purchase_price,
      selling_price = $selling_price,
      reorder_level = $reorder_level
    WHERE id = $id;
  `);
  return stmt.run({
    $id: id,
    $sku: p.sku || null,
    $name: p.name,
    $description: p.description || null,
    $hsn_sac_code: p.hsn_sac_code || null,
    $gst_rate_id: p.gst_rate_id,
    $unit: p.unit || "PCS",
    $purchase_price: p.purchase_price || 0.0,
    $selling_price: p.selling_price || 0.0,
    $reorder_level: p.reorder_level || 0.0
  });
}

export function adjustProductStock(productId: string, delta: number) {
  db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id = ?;").run(delta, productId);
  const row = db.query("SELECT current_stock FROM products WHERE id = ?;").get(productId) as { current_stock: number } | null;
  return row ? row.current_stock : 0.0;
}

export function archiveProduct(id: string) {
  const stmt = db.prepare("UPDATE products SET is_active = 0 WHERE id = ?;");
  return stmt.run(id);
}

export function getGstRates() {
  return db.query("SELECT * FROM gst_rates ORDER BY rate ASC;").all();
}

export function getNextCustomerId() {
  const row = db.query("SELECT id FROM customers WHERE id LIKE 'CUST-%' ORDER BY id DESC LIMIT 1;").get() as { id: string } | null;
  if (!row) {
    return "CUST-000001";
  }
  const match = row.id.match(/^CUST-(\d+)$/);
  if (!match) {
    return "CUST-000001";
  }
  const nextNum = parseInt(match[1]) + 1;
  return `CUST-${String(nextNum).padStart(6, '0')}`;
}

// --- Invoice Database Helpers ---
export function getNextInvoiceNumber() {
  const prefixRow = db.query("SELECT value FROM settings WHERE key = 'invoice_prefix';").get() as { value: string } | null;
  const numRow = db.query("SELECT value FROM settings WHERE key = 'invoice_next_number';").get() as { value: string } | null;
  
  const prefix = prefixRow ? prefixRow.value : "INV-";
  const numVal = numRow ? parseInt(numRow.value) : 1;
  
  return `${prefix}${String(numVal).padStart(6, '0')}`;
}

export function getInvoices() {
  return db.query(`
    SELECT i.invoice_number as id, i.invoice_date, i.customer_id, i.place_of_supply, i.taxable_amount as taxable_value, i.total_cgst as cgst_amount, i.total_sgst as sgst_amount, i.total_igst as igst_amount, i.round_off, i.grand_total, i.status, c.name as customer_name,
           COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_number = i.invoice_number), 0) as paid_amount 
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    ORDER BY i.invoice_date DESC, i.invoice_number DESC;
  `).all();
}

export function getInvoice(id: string) {
  const invoice = db.query(`
    SELECT i.invoice_number as id, i.invoice_date, i.customer_id, i.place_of_supply, c.state_code, i.taxable_amount as taxable_value, i.total_cgst as cgst_amount, i.total_sgst as sgst_amount, i.total_igst as igst_amount, i.round_off, i.grand_total, i.notes, i.status, c.name as customer_name, c.gstin as customer_gstin, c.phone as customer_phone, c.billing_address as customer_billing_address,
           COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_number = i.invoice_number), 0) as paid_amount
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_number = ?;
  `).get(id);

  if (!invoice) return null;

  const items = db.query(`
    SELECT invoice_number as invoice_id, product_id, description as product_name, hsn_sac_code, quantity, unit, rate as unit_price, taxable_value, gst_rate, cgst as cgst_amount, sgst as sgst_amount, igst as igst_amount, line_total as total_amount
    FROM invoice_items 
    WHERE invoice_number = ?;
  `).all(id);

  return { invoice, items };
}

export function createInvoice(inv: any, items: any[]) {
  // Use a transaction block to ensure atomic invoice creation and settings counter updates
  const transaction = db.transaction(() => {
    // 1. Insert invoice header record
    const insertInv = db.prepare(`
      INSERT INTO invoices (invoice_number, invoice_date, customer_id, place_of_supply, notes, taxable_amount, total_cgst, total_sgst, total_igst, round_off, grand_total, status)
      VALUES ($invoice_number, $invoice_date, $customer_id, $place_of_supply, $notes, $taxable_amount, $total_cgst, $total_sgst, $total_igst, $round_off, $grand_total, $status);
    `);
    
    insertInv.run({
      $invoice_number: inv.id,
      $invoice_date: inv.invoice_date,
      $customer_id: inv.customer_id,
      $place_of_supply: inv.place_of_supply,
      $notes: inv.notes || null,
      $taxable_amount: inv.taxable_value,
      $total_cgst: inv.cgst_amount,
      $total_sgst: inv.sgst_amount,
      $total_igst: inv.igst_amount,
      $round_off: inv.round_off,
      $grand_total: inv.grand_total,
      $status: inv.status || "Draft"
    });

    // 2. Insert line items
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_number, product_id, description, hsn_sac_code, quantity, unit, rate, discount, taxable_value, gst_rate, cgst, sgst, igst, line_total)
      VALUES ($invoice_number, $product_id, $description, $hsn_sac_code, $quantity, $unit, $rate, $discount, $taxable_value, $gst_rate, $cgst, $sgst, $igst, $line_total);
    `);

    for (const item of items) {
      // Deduct product stock automatically
      db.prepare("UPDATE products SET current_stock = current_stock - ? WHERE id = ?;").run(item.quantity, item.product_id);

      insertItem.run({
        $invoice_number: inv.id,
        $product_id: item.product_id,
        $description: item.product_name,
        $hsn_sac_code: item.hsn_sac_code || null,
        $quantity: item.quantity,
        $unit: item.unit || "PCS",
        $rate: item.unit_price,
        $discount: 0.0,
        $taxable_value: item.taxable_value,
        $gst_rate: item.gst_rate,
        $cgst: item.cgst_amount,
        $sgst: item.sgst_amount,
        $igst: item.igst_amount,
        $line_total: item.total_amount
      });
    }

    // 3. Update the sequence index counter
    const currentNumRow = db.query("SELECT value FROM settings WHERE key = 'invoice_next_number';").get() as { value: string } | null;
    const currentNum = currentNumRow ? parseInt(currentNumRow.value) : 1;
    db.prepare("UPDATE settings SET value = ? WHERE key = 'invoice_next_number';").run(String(currentNum + 1));
  });

  return transaction();
}

export function deleteInvoice(id: string) {
  const transaction = db.transaction(() => {
    // Restore product stocks first
    const items = db.query("SELECT product_id, quantity FROM invoice_items WHERE invoice_number = ?;").all(id) as { product_id: string, quantity: number }[];
    for (const item of items) {
      db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id = ?;").run(item.quantity, item.product_id);
    }
    // Delete invoice (foreign key cascades delete items)
    db.prepare("DELETE FROM invoices WHERE invoice_number = ?;").run(id);
    // Delete payments associated
    db.prepare("DELETE FROM payments WHERE invoice_number = ?;").run(id);
  });
  return transaction();
}

export function updateInvoiceStatus(id: string, status: string) {
  const stmt = db.prepare("UPDATE invoices SET status = ? WHERE invoice_number = ?;");
  return stmt.run(status, id);
}

export function recordPayment(payment: any) {
  const transaction = db.transaction(() => {
    // Look up customer ID (party_id) and grand_total
    const invRow = db.query("SELECT customer_id, grand_total FROM invoices WHERE invoice_number = ?;").get(payment.invoice_number) as { customer_id: string, grand_total: number } | null;
    if (!invRow) throw new Error(`Invoice ${payment.invoice_number} not found`);

    // 1. Insert payment record
    const stmt = db.prepare(`
      INSERT INTO payments (direction, party_id, invoice_number, amount, payment_date, payment_method, reference_number, notes)
      VALUES ($direction, $party_id, $invoice_number, $amount, $payment_date, $payment_method, $reference_number, $notes);
    `);
    stmt.run({
      $direction: 'IN',
      $party_id: invRow.customer_id,
      $invoice_number: payment.invoice_number,
      $amount: payment.amount,
      $payment_date: payment.payment_date,
      $payment_method: payment.payment_method,
      $reference_number: payment.reference_number || null,
      $notes: payment.notes || null
    });

    // 2. Compute total payments recorded for this invoice
    const sumRow = db.query("SELECT SUM(amount) as paid FROM payments WHERE invoice_number = ?;").get(payment.invoice_number) as { paid: number | null };
    const paid = sumRow.paid || 0;

    // 3. Update status
    let newStatus = "Partially Paid";
    if (paid >= invRow.grand_total) {
      newStatus = "Paid";
    }
    db.prepare("UPDATE invoices SET status = ? WHERE invoice_number = ?;").run(newStatus, payment.invoice_number);
  });
  return transaction();
}

// --- Suppliers CRUD ---
export function getSuppliers() {
  return db.query("SELECT * FROM suppliers ORDER BY name ASC;").all();
}

export function createSupplier(sup: any) {
  const stmt = db.prepare(`
    INSERT INTO suppliers (name, gstin, phone, email, address, state, state_code)
    VALUES ($name, $gstin, $phone, $email, $address, $state, $state_code);
  `);
  return stmt.run({
    $name: sup.name,
    $gstin: sup.gstin || null,
    $phone: sup.phone || null,
    $email: sup.email || null,
    $address: sup.address || null,
    $state: sup.state || 'Karnataka',
    $state_code: sup.state_code || '29'
  });
}

// --- Purchases CRUD ---
export function getPurchases() {
  return db.query(`
    SELECT p.purchase_number as id, p.supplier_invoice_number, p.invoice_date, p.taxable_amount, p.total_gst, p.grand_total, p.payment_status, s.name as supplier_name,
           (SELECT file_path FROM attachments WHERE entity_type = 'Purchase' AND entity_id = p.purchase_number LIMIT 1) as attachment_path
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.invoice_date DESC, p.created_at DESC;
  `).all();
}

export function getPurchase(id: string) {
  const purchase = db.query(`
    SELECT p.purchase_number as id, p.supplier_id, p.supplier_invoice_number, p.invoice_date, p.taxable_amount, p.total_gst, p.grand_total, p.payment_status, s.name as supplier_name, s.gstin as supplier_gstin
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.purchase_number = ?;
  `).get(id);

  if (!purchase) return null;

  const items = db.query(`
    SELECT pi.id, pi.product_id, pi.quantity, pi.purchase_price as unit_price, pi.taxable_value, pi.gst_rate, pi.gst_amount, pi.line_total, prod.name as product_name
    FROM purchase_items pi
    LEFT JOIN products prod ON pi.product_id = prod.id
    WHERE pi.purchase_number = ?;
  `).all(id);

  const attachments = db.query(`
    SELECT * FROM attachments WHERE entity_type = 'Purchase' AND entity_id = ?;
  `).all(id);

  return { purchase, items, attachments };
}

export function getNextPurchaseNumber() {
  const row = db.query("SELECT value FROM settings WHERE key = 'purchase_next_number';").get() as { value: string } | null;
  const nextNum = row ? parseInt(row.value) : 1;
  return `PUR-${String(nextNum).padStart(6, "0")}`;
}

export function createPurchase(pur: any, items: any[]) {
  const transaction = db.transaction(() => {
    // 1. Insert purchase record
    const insertPur = db.prepare(`
      INSERT INTO purchases (purchase_number, supplier_id, supplier_invoice_number, invoice_date, taxable_amount, total_gst, grand_total, payment_status)
      VALUES ($purchase_number, $supplier_id, $supplier_invoice_number, $invoice_date, $taxable_amount, $total_gst, $grand_total, $payment_status);
    `);

    insertPur.run({
      $purchase_number: pur.id,
      $supplier_id: pur.supplier_id,
      $supplier_invoice_number: pur.supplier_invoice_number || null,
      $invoice_date: pur.invoice_date,
      $taxable_amount: pur.taxable_amount,
      $total_gst: pur.total_gst,
      $grand_total: pur.grand_total,
      $payment_status: pur.payment_status || 'Unpaid'
    });

    // 2. Insert line items & increase product stock
    const insertItem = db.prepare(`
      INSERT INTO purchase_items (purchase_number, product_id, quantity, purchase_price, taxable_value, gst_rate, gst_amount, line_total)
      VALUES ($purchase_number, $product_id, $quantity, $purchase_price, $taxable_value, $gst_rate, $gst_amount, $line_total);
    `);

    for (const item of items) {
      if (item.product_id) {
        db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id = ?;").run(item.quantity, item.product_id);
      }

      insertItem.run({
        $purchase_number: pur.id,
        $product_id: item.product_id || null,
        $quantity: item.quantity,
        $purchase_price: item.unit_price,
        $taxable_value: item.taxable_value,
        $gst_rate: item.gst_rate,
        $gst_amount: item.gst_amount,
        $line_total: item.total_amount
      });
    }

    // 3. Insert payment record if Paid or Partially Paid
    if (pur.payment_status === 'Paid' || pur.payment_status === 'Partially Paid') {
      const payAmount = pur.payment_status === 'Paid' ? pur.grand_total : pur.grand_total / 2; // Simple default
      db.prepare(`
        INSERT INTO payments (direction, party_id, amount, payment_date, payment_method, notes)
        VALUES ('OUT', $party_id, $amount, $payment_date, 'Bank Transfer', $notes);
      `).run({
        $party_id: String(pur.supplier_id),
        $amount: payAmount,
        $payment_date: pur.invoice_date,
        $notes: `Auto-recorded payment for Purchase ${pur.id}`
      });
    }

    // 4. Update the settings sequence index
    const currentNumRow = db.query("SELECT value FROM settings WHERE key = 'purchase_next_number';").get() as { value: string } | null;
    const currentNum = currentNumRow ? parseInt(currentNumRow.value) : 1;
    db.prepare("UPDATE settings SET value = ? WHERE key = 'purchase_next_number';").run(String(currentNum + 1));
  });

  return transaction();
}

export function deletePurchase(id: string) {
  const transaction = db.transaction(() => {
    // Restore product stocks (deduct)
    const items = db.query("SELECT product_id, quantity FROM purchase_items WHERE purchase_number = ?;").all(id) as { product_id: string, quantity: number }[];
    for (const item of items) {
      if (item.product_id) {
        db.prepare("UPDATE products SET current_stock = current_stock - ? WHERE id = ?;").run(item.quantity, item.product_id);
      }
    }
    // Delete purchase cascades items deletion
    db.prepare("DELETE FROM purchases WHERE purchase_number = ?;").run(id);
    // Delete attachments linked
    db.prepare("DELETE FROM attachments WHERE entity_type = 'Purchase' AND entity_id = ?;").run(id);
  });
  return transaction();
}

// --- Expenses CRUD ---
export function getExpenses() {
  return db.query(`
    SELECT e.id, e.expense_date, e.vendor, e.category, e.amount, e.gst_amount, e.payment_method, e.notes,
           COALESCE(e.attachment_path, (SELECT file_path FROM attachments WHERE entity_type = 'Expense' AND entity_id = CAST(e.id AS TEXT) LIMIT 1)) as attachment_path
    FROM expenses e
    ORDER BY e.expense_date DESC, e.id DESC;
  `).all();
}

export function createExpense(exp: any) {
  let insertedId: number = 0;
  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO expenses (category, amount, gst_amount, expense_date, payment_method, notes)
      VALUES ($category, $amount, $gst_amount, $expense_date, $payment_method, $notes);
    `);
    const runResult = stmt.run({
      $category: exp.category,
      $amount: exp.amount,
      $gst_amount: exp.gst_amount || 0.0,
      $expense_date: exp.expense_date,
      $payment_method: exp.payment_method,
      $notes: exp.notes || null
    });
    insertedId = Number(runResult.lastInsertRowid);

    // Also record payment outflows in the payment registry
    db.prepare(`
      INSERT INTO payments (direction, party_id, amount, payment_date, payment_method, reference_number, notes)
      VALUES ('OUT', 'EXPENSE', $amount, $payment_date, $payment_method, $reference_number, $notes);
    `).run({
      $amount: exp.amount,
      $payment_date: exp.expense_date,
      $payment_method: exp.payment_method,
      $reference_number: exp.reference_number || null,
      $notes: `Expense payment: ${exp.category} - ${exp.notes || ''}`
    });
  });
  transaction();
  return insertedId;
}

export function deleteExpense(id: number) {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM expenses WHERE id = ?;").run(id);
    db.prepare("DELETE FROM attachments WHERE entity_type = 'Expense' AND entity_id = ?;").run(String(id));
  });
  return transaction();
}

// --- Attachments ---
export function createAttachment(att: any) {
  const stmt = db.prepare(`
    INSERT INTO attachments (entity_type, entity_id, file_name, file_path, mime_type)
    VALUES ($entity_type, $entity_id, $file_name, $file_path, $mime_type);
  `);
  return stmt.run({
    $entity_type: att.entity_type,
    $entity_id: String(att.entity_id),
    $file_name: att.file_name,
    $file_path: att.file_path,
    $mime_type: att.mime_type || null
  });
}

// --- Dashboard & Analytics ---
export function getDashboardMetrics() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  
  const today = `${yyyy}-${mm}-${dd}`;
  const thisMonth = `${yyyy}-${mm}`;

  // Today's Sales
  const todaySalesRow = db.query("SELECT COALESCE(SUM(grand_total), 0.0) as total FROM invoices WHERE invoice_date = ?;").get(today) as { total: number };

  // Monthly Sales
  const monthlySalesRow = db.query("SELECT COALESCE(SUM(grand_total), 0.0) as total FROM invoices WHERE strftime('%Y-%m', invoice_date) = ?;").get(thisMonth) as { total: number };

  // Monthly Expenses (Purchases + Category Expenses)
  const monthlyPurchasesRow = db.query("SELECT COALESCE(SUM(grand_total), 0.0) as total FROM purchases WHERE strftime('%Y-%m', invoice_date) = ?;").get(thisMonth) as { total: number };
  const monthlyExpensesRow = db.query("SELECT COALESCE(SUM(amount), 0.0) as total FROM expenses WHERE strftime('%Y-%m', expense_date) = ?;").get(thisMonth) as { total: number };
  const totalExpenses = monthlyPurchasesRow.total + monthlyExpensesRow.total;

  // Outstanding Receivables
  const totalReceivablesRow = db.query("SELECT COALESCE(SUM(grand_total), 0.0) as total FROM invoices;").get() as { total: number };
  const totalReceivedRow = db.query("SELECT COALESCE(SUM(amount), 0.0) as total FROM payments WHERE direction = 'IN';").get() as { total: number };
  const receivables = totalReceivablesRow.total - totalReceivedRow.total;

  // Outstanding Payables
  const totalPayablesRow = db.query("SELECT COALESCE(SUM(grand_total), 0.0) as total FROM purchases;").get() as { total: number };
  const totalPaidOutRow = db.query("SELECT COALESCE(SUM(amount), 0.0) as total FROM payments WHERE direction = 'OUT' AND party_id != 'EXPENSE';").get() as { total: number };
  const payables = totalPayablesRow.total - totalPaidOutRow.total;

  // Profit Trend (Last 6 months in local time)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mY = d.getFullYear();
    const mM = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${mY}-${mM}`);
  }

  const trend = months.map(m => {
    const s = db.query("SELECT COALESCE(SUM(grand_total), 0.0) as total FROM invoices WHERE strftime('%Y-%m', invoice_date) = ?;").get(m) as { total: number };
    const p = db.query("SELECT COALESCE(SUM(grand_total), 0.0) as total FROM purchases WHERE strftime('%Y-%m', invoice_date) = ?;").get(m) as { total: number };
    const e = db.query("SELECT COALESCE(SUM(amount), 0.0) as total FROM expenses WHERE strftime('%Y-%m', expense_date) = ?;").get(m) as { total: number };
    return {
      month: m,
      sales: s.total,
      expenses: p.total + e.total
    };
  });

  // Expense Categories Distribution (This month)
  const categoryBreakdown = db.query(`
    SELECT category, SUM(amount) as total 
    FROM expenses 
    WHERE strftime('%Y-%m', expense_date) = ? 
    GROUP BY category;
  `).all(thisMonth) as { category: string, total: number }[];

  // Include purchases as a category too
  if (monthlyPurchasesRow.total > 0) {
    categoryBreakdown.push({ category: "Purchases", total: monthlyPurchasesRow.total });
  }

  // Recent Invoices (Last 5)
  const recentInvoices = db.query(`
    SELECT i.invoice_number, i.invoice_date, c.name as customer_name, i.grand_total, i.status
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    ORDER BY i.invoice_date DESC, i.invoice_number DESC
    LIMIT 5;
  `).all() as any[];

  // Top products by sales volume (This month)
  const topProducts = db.query(`
    SELECT COALESCE(p.name, ii.product_id) as name, SUM(ii.quantity) as total_qty
    FROM invoice_items ii
    LEFT JOIN products p ON ii.product_id = p.id
    LEFT JOIN invoices i ON ii.invoice_number = i.invoice_number
    WHERE strftime('%Y-%m', i.invoice_date) = ?
    GROUP BY ii.product_id
    ORDER BY total_qty DESC
    LIMIT 3;
  `).all(thisMonth) as { name: string, total_qty: number }[];

  const netProfit = monthlySalesRow.total - totalExpenses;
  const profitMargin = monthlySalesRow.total > 0 ? (netProfit / monthlySalesRow.total) * 100 : 0.0;

  return {
    todaySales: todaySalesRow.total,
    monthlySales: monthlySalesRow.total,
    monthlyExpenses: totalExpenses,
    receivables: Math.max(0, receivables),
    payables: Math.max(0, payables),
    trend,
    expensesDistribution: categoryBreakdown,
    netProfit,
    profitMargin,
    recentInvoices,
    topProducts
  };
}

// --- GST Reports Analytics ---
export function getGstReport(monthStr: string) {
  const fromDate = `${monthStr}-01`;
  const [year, m] = monthStr.split("-").map(Number);
  const endDay = new Date(year, m, 0).getDate();
  const toDate = `${monthStr}-${String(endDay).padStart(2, "0")}`;
  return getGstReportForPeriod(fromDate, toDate);
}

export function getGstReportForPeriod(fromDate: string, toDate: string) {
  // GSTR-1: Outward Supplies B2B (With GSTIN)
  const gstr1b2b = db.query(`
    SELECT i.invoice_number, i.invoice_date, c.name as customer_name, c.gstin as customer_gstin, 
           i.taxable_amount, i.total_cgst, i.total_sgst, i.total_igst, i.grand_total
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_date BETWEEN ? AND ? AND c.gstin IS NOT NULL AND c.gstin != ''
    ORDER BY i.invoice_date ASC, i.invoice_number ASC;
  `).all(fromDate, toDate);

  // GSTR-1: Outward Supplies B2C (Without GSTIN)
  const gstr1b2c = db.query(`
    SELECT i.invoice_number, i.invoice_date, c.name as customer_name, 
           i.taxable_amount, i.total_cgst, i.total_sgst, i.total_igst, i.grand_total
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_date BETWEEN ? AND ? AND (c.gstin IS NULL OR c.gstin = '')
    ORDER BY i.invoice_date ASC, i.invoice_number ASC;
  `).all(fromDate, toDate);

  // GSTR-1: HSN Outward Summary
  const gstr1hsn = db.query(`
    SELECT ii.hsn_sac_code, 
           SUM(ii.quantity) as total_qty, 
           SUM(ii.taxable_value) as total_taxable, 
           SUM(ii.cgst) as total_cgst, 
           SUM(ii.sgst) as total_sgst, 
           SUM(ii.igst) as total_igst, 
           SUM(ii.line_total) as total_amount
    FROM invoice_items ii
    LEFT JOIN invoices i ON ii.invoice_number = i.invoice_number
    WHERE i.invoice_date BETWEEN ? AND ? AND ii.hsn_sac_code IS NOT NULL AND ii.hsn_sac_code != ''
    GROUP BY ii.hsn_sac_code;
  `).all(fromDate, toDate);

  // GSTR-3B: Output Tax Outward Supplies
  const gstr3bOutput = db.query(`
    SELECT COALESCE(SUM(taxable_amount), 0.0) as taxable,
           COALESCE(SUM(total_cgst), 0.0) as cgst,
           COALESCE(SUM(total_sgst), 0.0) as sgst,
           COALESCE(SUM(total_igst), 0.0) as igst
    FROM invoices
    WHERE invoice_date BETWEEN ? AND ?;
  `).get(fromDate, toDate) as { taxable: number, cgst: number, sgst: number, igst: number };

  // GSTR-3B: Input Tax Credit (ITC) from Purchases
  const gstr3bPurchaseItc = db.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN s.state_code = '29' THEN p.total_gst / 2.0 ELSE 0.0 END), 0.0) as cgst_credit,
      COALESCE(SUM(CASE WHEN s.state_code = '29' THEN p.total_gst / 2.0 ELSE 0.0 END), 0.0) as sgst_credit,
      COALESCE(SUM(CASE WHEN s.state_code != '29' THEN p.total_gst ELSE 0.0 END), 0.0) as igst_credit
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.invoice_date BETWEEN ? AND ?;
  `).get(fromDate, toDate) as { cgst_credit: number, sgst_credit: number, igst_credit: number };

  // GSTR-3B: Input Tax Credit (ITC) from Expenses
  const gstr3bExpenseItc = db.query(`
    SELECT 
      COALESCE(SUM(gst_amount / 2.0), 0.0) as cgst_credit,
      COALESCE(SUM(gst_amount / 2.0), 0.0) as sgst_credit
    FROM expenses
    WHERE expense_date BETWEEN ? AND ?;
  `).get(fromDate, toDate) as { cgst_credit: number, sgst_credit: number };

  return {
    gstr1b2b,
    gstr1b2c,
    gstr1hsn,
    gstr3b: {
      output_taxable: gstr3bOutput.taxable,
      output_cgst: gstr3bOutput.cgst,
      output_sgst: gstr3bOutput.sgst,
      output_igst: gstr3bOutput.igst,
      
      itc_cgst: gstr3bPurchaseItc.cgst_credit + gstr3bExpenseItc.cgst_credit,
      itc_sgst: gstr3bPurchaseItc.sgst_credit + gstr3bExpenseItc.sgst_credit,
      itc_igst: gstr3bPurchaseItc.igst_credit,
      
      net_cgst: gstr3bOutput.cgst - (gstr3bPurchaseItc.cgst_credit + gstr3bExpenseItc.cgst_credit),
      net_sgst: gstr3bOutput.sgst - (gstr3bPurchaseItc.sgst_credit + gstr3bExpenseItc.sgst_credit),
      net_igst: gstr3bOutput.igst - gstr3bPurchaseItc.igst_credit
    },
    gstr3bDetails: getGstr3bFilingSummary(fromDate, toDate)
  };
}

// --- Payments Ledger ---
export function getPaymentsLedger() {
  return db.query(`
    SELECT p.*,
           CASE 
             WHEN p.direction = 'IN' THEN COALESCE((SELECT name FROM customers WHERE id = CAST(p.party_id AS INTEGER)), 'Customer ID ' || p.party_id)
             WHEN p.direction = 'OUT' AND p.party_id = 'EXPENSE' THEN 'Operating Expense outflow'
             WHEN p.direction = 'OUT' THEN COALESCE((SELECT name FROM suppliers WHERE id = CAST(p.party_id AS INTEGER)), 'Supplier ID ' || p.party_id)
             ELSE 'General Transaction'
           END as party_name
    FROM payments p
    ORDER BY p.payment_date DESC, p.id DESC;
  `).all();
}

// --- Period-based Invoices for GST Export ---
export function getInvoicesForPeriod(fromDate: string, toDate: string) {
  const invoices = db.query(`
    SELECT i.*, c.name as customer_name, c.gstin as customer_gstin, c.state as customer_state
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_date BETWEEN ? AND ?
    ORDER BY i.invoice_date ASC, i.invoice_number ASC;
  `).all(fromDate, toDate) as any[];

  invoices.forEach(inv => {
    inv.items = db.query(`
      SELECT ii.*, p.name as description, p.unit
      FROM invoice_items ii
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_number = ?;
    `).all(inv.invoice_number) as any[];
  });

  return invoices;
}

// --- Comprehensive Tax Registers & filing Reports ---
export function getFilingRegistersReport(fromDate: string, toDate: string) {
  const yearStr = fromDate.substring(0, 4);

  // 1. Sales Register
  const salesRegister = db.query(`
    SELECT i.invoice_number, i.invoice_date, c.name as customer_name, c.gstin as customer_gstin,
           i.taxable_amount, i.total_cgst, i.total_sgst, i.total_igst, i.grand_total, i.status
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_date BETWEEN ? AND ?
    ORDER BY i.invoice_date ASC, i.invoice_number ASC;
  `).all(fromDate, toDate);

  // 2. Purchase Register
  const purchaseRegister = db.query(`
    SELECT p.purchase_number, p.invoice_date, s.name as supplier_name, s.gstin as supplier_gstin,
           p.taxable_amount, p.total_gst, p.grand_total, p.payment_status
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.invoice_date BETWEEN ? AND ?
    ORDER BY p.invoice_date ASC, p.purchase_number ASC;
  `).all(fromDate, toDate);

  // 3. State-wise Sales (Geographical distribution)
  const stateWiseSales = db.query(`
    SELECT COALESCE(c.state, 'Unregistered / Direct Consumer') as state_name,
           COALESCE(i.place_of_supply, '29') as state_code,
           COUNT(i.invoice_number) as invoice_count,
           SUM(i.taxable_amount) as total_taxable,
           SUM(i.total_cgst) as total_cgst,
           SUM(i.total_sgst) as total_sgst,
           SUM(i.total_igst) as total_igst,
           SUM(i.grand_total) as total_value
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_date BETWEEN ? AND ?
    GROUP BY i.place_of_supply, c.state
    ORDER BY total_value DESC;
  `).all(fromDate, toDate);

  // 4. GST Rate Summary (Sales)
  const rateSummarySales = db.query(`
    SELECT ii.gst_rate,
           SUM(ii.taxable_value) as sales_taxable,
           SUM(ii.cgst) as sales_cgst,
           SUM(ii.sgst) as sales_sgst,
           SUM(ii.igst) as sales_igst
    FROM invoice_items ii
    LEFT JOIN invoices i ON ii.invoice_number = i.invoice_number
    WHERE i.invoice_date BETWEEN ? AND ?
    GROUP BY ii.gst_rate;
  `).all(fromDate, toDate);

  // 5. GST Rate Summary (Purchases)
  const rateSummaryPurchases = db.query(`
    SELECT pi.gst_rate,
           SUM(pi.taxable_value) as purchase_taxable,
           SUM(CASE WHEN s.state_code = '29' THEN pi.line_total - pi.taxable_value ELSE 0.0 END) / 2.0 as purchase_cgst,
           SUM(CASE WHEN s.state_code = '29' THEN pi.line_total - pi.taxable_value ELSE 0.0 END) / 2.0 as purchase_sgst,
           SUM(CASE WHEN s.state_code != '29' THEN pi.line_total - pi.taxable_value ELSE 0.0 END) as purchase_igst
    FROM purchase_items pi
    LEFT JOIN purchases p ON pi.purchase_number = p.purchase_number
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.invoice_date BETWEEN ? AND ?
    GROUP BY pi.gst_rate;
  `).all(fromDate, toDate);

  // 6. Monthly Summary for the current calendar year of the query
  const monthlySummary = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${yearStr}-${String(m).padStart(2, "0")}`;
    const s = db.query("SELECT COALESCE(SUM(taxable_amount), 0.0) as tx, COALESCE(SUM(total_cgst + total_sgst + total_igst), 0.0) as gst FROM invoices WHERE strftime('%Y-%m', invoice_date) = ?;").get(monthStr) as any;
    const p = db.query("SELECT COALESCE(SUM(taxable_amount), 0.0) as tx, COALESCE(SUM(total_gst), 0.0) as gst FROM purchases WHERE strftime('%Y-%m', invoice_date) = ?;").get(monthStr) as any;
    const e = db.query("SELECT COALESCE(SUM(amount), 0.0) as tx, COALESCE(SUM(gst_amount), 0.0) as gst FROM expenses WHERE strftime('%Y-%m', expense_date) = ?;").get(monthStr) as any;

    monthlySummary.push({
      month: monthStr,
      salesTaxable: s.tx,
      salesGst: s.gst,
      purchaseTaxable: p.tx,
      purchaseGst: p.gst,
      expenseTaxable: e.tx,
      expenseGst: e.gst
    });
  }

  // 7. Quarterly Summary (Calculated from Monthly Summary)
  const quarterlySummary = [
    { name: "Q1 (Jan-Mar)", salesTaxable: 0, salesGst: 0, purchaseTaxable: 0, purchaseGst: 0, expenseTaxable: 0, expenseGst: 0 },
    { name: "Q2 (Apr-Jun)", salesTaxable: 0, salesGst: 0, purchaseTaxable: 0, purchaseGst: 0, expenseTaxable: 0, expenseGst: 0 },
    { name: "Q3 (Jul-Sep)", salesTaxable: 0, salesGst: 0, purchaseTaxable: 0, purchaseGst: 0, expenseTaxable: 0, expenseGst: 0 },
    { name: "Q4 (Oct-Dec)", salesTaxable: 0, salesGst: 0, purchaseTaxable: 0, purchaseGst: 0, expenseTaxable: 0, expenseGst: 0 }
  ];

  monthlySummary.forEach((m, idx) => {
    const qIdx = Math.floor(idx / 3);
    quarterlySummary[qIdx].salesTaxable += m.salesTaxable;
    quarterlySummary[qIdx].salesGst += m.salesGst;
    quarterlySummary[qIdx].purchaseTaxable += m.purchaseTaxable;
    quarterlySummary[qIdx].purchaseGst += m.purchaseGst;
    quarterlySummary[qIdx].expenseTaxable += m.expenseTaxable;
    quarterlySummary[qIdx].expenseGst += m.expenseGst;
  });

  // 8. Annual Summary (Sum of all months)
  const annualSummary = {
    salesTaxable: monthlySummary.reduce((sum, m) => sum + m.salesTaxable, 0),
    salesGst: monthlySummary.reduce((sum, m) => sum + m.salesGst, 0),
    purchaseTaxable: monthlySummary.reduce((sum, m) => sum + m.purchaseTaxable, 0),
    purchaseGst: monthlySummary.reduce((sum, m) => sum + m.purchaseGst, 0),
    expenseTaxable: monthlySummary.reduce((sum, m) => sum + m.expenseTaxable, 0),
    expenseGst: monthlySummary.reduce((sum, m) => sum + m.expenseGst, 0)
  };

  return {
    salesRegister,
    purchaseRegister,
    stateWiseSales,
    rateSummarySales,
    rateSummaryPurchases,
    monthlySummary,
    quarterlySummary,
    annualSummary
  };
}

// --- Derived GSTR-3B filing Calculator ---
export function getGstr3bFilingSummary(fromDate: string, toDate: string) {
  // 1. Table 3.1: Outward Supplies Details
  // (a) Taxable Outward Supplies (other than zero-rated, nil-rated, exempted)
  const salesTaxable = db.query(`
    SELECT COALESCE(SUM(ii.taxable_value), 0.0) as txval,
           COALESCE(SUM(ii.cgst), 0.0) as cgst,
           COALESCE(SUM(ii.sgst), 0.0) as sgst,
           COALESCE(SUM(ii.igst), 0.0) as igst
    FROM invoice_items ii
    LEFT JOIN invoices i ON ii.invoice_number = i.invoice_number
    WHERE i.invoice_date BETWEEN ? AND ? AND ii.gst_rate > 0;
  `).get(fromDate, toDate) as any;

  // (b) Zero Rated Supplies (Classified if place of supply is export '96' or similar, or customer state contains 'Export')
  const salesZeroRated = db.query(`
    SELECT COALESCE(SUM(ii.taxable_value), 0.0) as txval,
           COALESCE(SUM(ii.igst), 0.0) as igst
    FROM invoice_items ii
    LEFT JOIN invoices i ON ii.invoice_number = i.invoice_number
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_date BETWEEN ? AND ? AND (i.place_of_supply = '96' OR c.state = 'Export');
  `).get(fromDate, toDate) as any;

  // (c) Nil Rated & Exempt Supplies (invoices lines with rate 0)
  const salesExempt = db.query(`
    SELECT COALESCE(SUM(ii.taxable_value), 0.0) as txval
    FROM invoice_items ii
    LEFT JOIN invoices i ON ii.invoice_number = i.invoice_number
    WHERE i.invoice_date BETWEEN ? AND ? AND ii.gst_rate = 0;
  `).get(fromDate, toDate) as any;

  // 2. Table 4: Input Tax Credit Details
  // (A)(1) Import of Goods (Supplier State Code '97' or Name contains 'Import')
  const importGoods = db.query(`
    SELECT COALESCE(SUM(p.total_gst), 0.0) as igst,
           COALESCE(SUM(p.taxable_amount), 0.0) as txval
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.invoice_date BETWEEN ? AND ? AND (s.state_code = '97' OR s.name LIKE '%Import%');
  `).get(fromDate, toDate) as any;

  // (A)(5) All Other ITC: Total regular purchases + regular expenses (except blocked fuel)
  const regularPurchases = db.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN s.state_code = '29' THEN p.total_gst / 2.0 ELSE 0.0 END), 0.0) as cgst,
      COALESCE(SUM(CASE WHEN s.state_code = '29' THEN p.total_gst / 2.0 ELSE 0.0 END), 0.0) as sgst,
      COALESCE(SUM(CASE WHEN s.state_code != '29' AND s.state_code != '97' THEN p.total_gst ELSE 0.0 END), 0.0) as igst
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.invoice_date BETWEEN ? AND ? AND (s.state_code != '97' AND s.name NOT LIKE '%Import%');
  `).get(fromDate, toDate) as any;

  // Eligible Expenses ITC (excluding Fuel category which is blocked under 17(5))
  const regularExpenses = db.query(`
    SELECT 
      COALESCE(SUM(gst_amount / 2.0), 0.0) as cgst,
      COALESCE(SUM(gst_amount / 2.0), 0.0) as sgst
    FROM expenses
    WHERE expense_date BETWEEN ? AND ? AND category != 'Fuel';
  `).get(fromDate, toDate) as any;

  // (D)(1) Ineligible ITC under section 17(5) (Blocked Credit: Fuel expenses GST)
  const blockedCredit = db.query(`
    SELECT 
      COALESCE(SUM(gst_amount / 2.0), 0.0) as cgst,
      COALESCE(SUM(gst_amount / 2.0), 0.0) as sgst
    FROM expenses
    WHERE expense_date BETWEEN ? AND ? AND category = 'Fuel';
  `).get(fromDate, toDate) as any;

  // Net ITC CGST / SGST / IGST calculation
  const totalItcCgst = regularPurchases.cgst + regularExpenses.cgst;
  const totalItcSgst = regularPurchases.sgst + regularExpenses.sgst;
  const totalItcIgst = importGoods.igst + regularPurchases.igst;

  const reversalsCgst = 0.0;
  const reversalsSgst = 0.0;
  const reversalsIgst = 0.0;

  const netItcCgst = totalItcCgst - reversalsCgst;
  const netItcSgst = totalItcSgst - reversalsSgst;
  const netItcIgst = totalItcIgst - reversalsIgst;

  // 3. Tax Liability & Net Payable
  const outputCgst = salesTaxable.cgst;
  const outputSgst = salesTaxable.sgst;
  const outputIgst = salesTaxable.igst + salesZeroRated.igst;

  const netCgstPayable = Math.max(0, outputCgst - netItcCgst);
  const netSgstPayable = Math.max(0, outputSgst - netItcSgst);
  const netIgstPayable = Math.max(0, outputIgst - netItcIgst);

  // 4. Late Fee & Interest Calculations
  // Due date is the 20th of the month following toDate
  const toParts = toDate.split("-").map(Number);
  const dueYear = toParts[1] === 12 ? toParts[0] + 1 : toParts[0];
  const dueMonth = toParts[1] === 12 ? 1 : toParts[1] + 1;
  const dueDate = new Date(dueYear, dueMonth - 1, 20);
  const today = new Date();

  let daysLate = 0;
  let interest = 0.0;
  let lateFee = 0.0;

  if (today > dueDate) {
    const diffTime = Math.abs(today.getTime() - dueDate.getTime());
    daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Late fee: ₹50 per day (₹25 CGST, ₹25 SGST) if liability exists, ₹20 if Nil
    const dailyRate = (outputCgst + outputSgst + outputIgst > 0) ? 50.0 : 20.0;
    lateFee = Math.min(10000.0, daysLate * dailyRate); // Max ₹10,000 cap

    // Interest: 18% per annum on net payable tax
    const totalNetPayable = netCgstPayable + netSgstPayable + netIgstPayable;
    if (totalNetPayable > 0) {
      interest = (totalNetPayable * 0.18 * daysLate) / 365.0;
    }
  }

  const totalPayable = netCgstPayable + netSgstPayable + netIgstPayable + interest + lateFee;

  return {
    table3_1: {
      a: { txval: salesTaxable.txval, cgst: salesTaxable.cgst, sgst: salesTaxable.sgst, igst: salesTaxable.igst, cess: 0.0 },
      b: { txval: salesZeroRated.txval, cgst: 0.0, sgst: 0.0, igst: salesZeroRated.igst, cess: 0.0 },
      c: { txval: salesExempt.txval, cgst: 0.0, sgst: 0.0, igst: 0.0, cess: 0.0 },
      d: { txval: 0.0, cgst: 0.0, sgst: 0.0, igst: 0.0, cess: 0.0 }, // Inward RC
      e: { txval: 0.0, cgst: 0.0, sgst: 0.0, igst: 0.0, cess: 0.0 }  // Non-GST
    },
    table4: {
      importGoods: { txval: importGoods.txval, igst: importGoods.igst, cgst: 0.0, sgst: 0.0 },
      importServices: { txval: 0.0, igst: 0.0, cgst: 0.0, sgst: 0.0 },
      inwardRC: { txval: 0.0, igst: 0.0, cgst: 0.0, sgst: 0.0 },
      isd: { igst: 0.0, cgst: 0.0, sgst: 0.0 },
      allOtherItc: { igst: regularPurchases.igst, cgst: totalItcCgst, sgst: totalItcSgst },
      reversals: { igst: reversalsIgst, cgst: reversalsCgst, sgst: reversalsSgst },
      netItc: { igst: netItcIgst, cgst: netItcCgst, sgst: netItcSgst },
      blocked: { igst: 0.0, cgst: blockedCredit.cgst, sgst: blockedCredit.sgst }
    },
    liability: {
      output: { cgst: outputCgst, sgst: outputSgst, igst: outputIgst, cess: 0.0 },
      itc: { cgst: netItcCgst, sgst: netItcSgst, igst: netItcIgst, cess: 0.0 },
      netPayable: { cgst: netCgstPayable, sgst: netSgstPayable, igst: netIgstPayable, cess: 0.0 },
      daysLate,
      dueDate: dueDate.toISOString().substring(0, 10),
      interest,
      lateFee,
      totalPayable
    }
  };
}


