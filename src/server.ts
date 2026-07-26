import { serve } from "bun";
import { spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { 
  db,
  dbPath,
  isDbInitialized,
  initializeDatabase,
  isDatabaseFileExisting,
  initSchema, 
  getSettings,
  updateSetting,
  getCustomers,
  searchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getProducts,
  searchProducts,
  createProduct,
  updateProduct,
  archiveProduct,
  adjustProductStock,
  getGstRates,
  getNextCustomerId,
  getNextInvoiceNumber,
  getInvoices,
  getInvoice,
  createInvoice,
  deleteInvoice,
  updateInvoiceStatus,
  recordPayment,
  getSuppliers,
  createSupplier,
  getPurchases,
  getPurchase,
  getNextPurchaseNumber,
  createPurchase,
  deletePurchase,
  getExpenses,
  createExpense,
  deleteExpense,
  createAttachment,
  getDashboardMetrics,
  getGstReport,
  getPaymentsLedger,
  reopenDatabase,
  getInvoicesForPeriod,
  getGstReportForPeriod,
  getFilingRegistersReport
} from "./database";
import { generateGstr1 } from "./gstr1Generator";

// Ensure local attachments storage folder exists securely
await mkdir("./attachments", { recursive: true });

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1"; // Default to localhost for security compliance

// Regular expression to validate Indian GSTIN format
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Helper to construct secure JSON responses
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

const server = serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    // --- Static File Routing ---
    if (method === "GET") {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(Bun.file("./public/index.html"));
      }
      if (url.pathname === "/style.css") {
        return new Response(Bun.file("./public/style.css"), {
          headers: { 
            "Content-Type": "text/css",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
      if (url.pathname === "/app.js") {
        return new Response(Bun.file("./public/app.js"), {
          headers: { 
            "Content-Type": "application/javascript",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
      if (url.pathname === "/logo.jpg") {
        return new Response(Bun.file("./public/logo.jpg"), {
          headers: { 
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store, no-cache, must-revalidate"
          }
        });
      }
      if (url.pathname.startsWith("/attachments/")) {
        const filename = basename(url.pathname);
        return new Response(Bun.file(join("./attachments", filename)));
      }
    }

    // --- API: External Integration Routes ---
    if (url.pathname.startsWith("/api/external/")) {
      try {
        const settings = getSettings();
        const apiEnabled = settings.api_enabled === "true";
        
        if (!apiEnabled) {
          return jsonResponse({ error: "External API integration is disabled in Settings." }, 403);
        }
        
        const authHeader = req.headers.get("Authorization");
        const customKeyHeader = req.headers.get("x-api-key");
        
        let clientKey = "";
        if (authHeader && authHeader.startsWith("Bearer ")) {
          clientKey = authHeader.substring(7).trim();
        } else if (customKeyHeader) {
          clientKey = customKeyHeader.trim();
        }
        
        const serverKey = settings.api_key || "";
        
        if (!serverKey || clientKey !== serverKey) {
          return jsonResponse({ error: "Unauthorized. Invalid or missing API key." }, 401);
        }

        // 1. External API Status
        if (url.pathname === "/api/external/status" && method === "GET") {
          return jsonResponse({
            status: "OK",
            message: "API Authentication successful",
            business_name: settings.business_name || "My Business"
          });
        }

        // 2. External API: Create Product
        if (url.pathname === "/api/external/products" && method === "POST") {
          const body = await req.json();
          if (!body.id || !body.id.trim()) {
            return jsonResponse({ error: "Product SKU / ID is required" }, 400);
          }
          if (!body.name || !body.name.trim()) {
            return jsonResponse({ error: "Product Name is required" }, 400);
          }
          if (body.gst_rate === undefined) {
            return jsonResponse({ error: "Product gst_rate is required (e.g. 18.0)" }, 400);
          }

          const rateVal = parseFloat(body.gst_rate);
          const gstRates = getGstRates() as { id: number; rate: number }[];
          const targetRate = gstRates.find(r => r.rate === rateVal);
          
          if (!targetRate) {
            return jsonResponse({ error: `GST rate ${rateVal}% is not supported. Available rates: ${gstRates.map(r => r.rate).join(", ")}%` }, 400);
          }

          const productPayload = {
            id: body.id.trim(),
            sku: body.sku ? body.sku.trim() : body.id.trim(),
            name: body.name.trim(),
            description: body.description ? body.description.trim() : "",
            hsn_sac_code: body.hsn_sac_code ? body.hsn_sac_code.trim() : "",
            gst_rate_id: targetRate.id,
            unit: body.unit ? body.unit.trim() : "PCS",
            purchase_price: body.purchase_price !== undefined ? parseFloat(body.purchase_price) : 0.0,
            selling_price: body.selling_price !== undefined ? parseFloat(body.selling_price) : 0.0,
            current_stock: body.current_stock !== undefined ? parseFloat(body.current_stock) : 0.0,
            reorder_level: body.reorder_level !== undefined ? parseFloat(body.reorder_level) : 0.0
          };

          try {
            createProduct(productPayload);
            return jsonResponse({ success: true, message: "Product added to catalog", product: productPayload }, 201);
          } catch (err: any) {
            if (err.message && err.message.includes("UNIQUE constraint failed")) {
              return jsonResponse({ error: "Product SKU / ID already exists" }, 409);
            }
            throw err;
          }
        }

        // 3. External API: Create Purchase
        if (url.pathname === "/api/external/purchases" && method === "POST") {
          const body = await req.json();
          const { purchase, items } = body;
          
          if (!purchase || !purchase.supplier_id || !items || !Array.isArray(items) || items.length === 0) {
            return jsonResponse({ error: "Missing required purchase header (supplier_id) or items list" }, 400);
          }

          const supplierId = purchase.supplier_id;
          const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?;").get(supplierId) as any;
          if (!supplier) {
            return jsonResponse({ error: `Supplier with ID ${supplierId} not found` }, 400);
          }

          const merchantStateCode = settings.business_state_code || "29";
          const supplierStateCode = supplier.state_code || merchantStateCode;
          const isInterState = supplierStateCode !== merchantStateCode;

          let totalTaxable = 0;
          let totalGst = 0;
          const resolvedItems = [];

          for (const item of items) {
            if (!item.product_id) {
              return jsonResponse({ error: "product_id is required for all line items" }, 400);
            }
            const product = db.prepare("SELECT p.*, r.rate FROM products p JOIN gst_rates r ON p.gst_rate_id = r.id WHERE p.id = ?;").get(item.product_id) as any;
            if (!product) {
              return jsonResponse({ error: `Product with ID ${item.product_id} not found` }, 400);
            }

            const qty = parseFloat(item.quantity || 0);
            if (qty <= 0) {
              return jsonResponse({ error: "quantity must be greater than 0" }, 400);
            }
            const price = item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(product.purchase_price || 0.0);
            const taxableVal = item.taxable_value !== undefined ? parseFloat(item.taxable_value) : (qty * price);
            const gstRate = item.gst_rate !== undefined ? parseFloat(item.gst_rate) : parseFloat(product.rate || 0.0);
            const taxAmount = (taxableVal * gstRate) / 100;
            const lineTotal = taxableVal + taxAmount;

            totalTaxable += taxableVal;
            totalGst += taxAmount;

            resolvedItems.push({
              product_id: product.id,
              quantity: qty,
              unit_price: price,
              taxable_value: taxableVal,
              gst_rate: gstRate,
              gst_amount: taxAmount,
              total_amount: lineTotal
            });
          }

          const purchaseId = purchase.purchase_number || getNextPurchaseNumber();
          const purchasePayload = {
            id: purchaseId,
            supplier_id: supplierId,
            supplier_invoice_number: purchase.supplier_invoice_number || null,
            invoice_date: purchase.purchase_date || new Date().toISOString().split('T')[0],
            taxable_amount: totalTaxable,
            total_gst: totalGst,
            grand_total: totalTaxable + totalGst,
            payment_status: purchase.payment_status || "Unpaid"
          };

          createPurchase(purchasePayload, resolvedItems);
          return jsonResponse({ success: true, id: purchaseId, message: "Purchase invoice recorded successfully via API" }, 201);
        }

        // 4. External API: Create Invoice
        if (url.pathname === "/api/external/invoices" && method === "POST") {
          const body = await req.json();
          const { invoice, items } = body;
          
          if (!invoice || !invoice.customer_id || !items || !Array.isArray(items) || items.length === 0) {
            return jsonResponse({ error: "Missing required invoice header (customer_id) or items list" }, 400);
          }

          const customerId = invoice.customer_id;
          const customer = db.prepare("SELECT * FROM customers WHERE id = ?;").get(customerId) as any;
          if (!customer) {
            return jsonResponse({ error: `Customer with ID ${customerId} not found` }, 400);
          }

          const merchantStateCode = settings.business_state_code || "29";
          const customerStateCode = customer.state_code || merchantStateCode;
          const isInterState = customerStateCode !== merchantStateCode;
          const placeOfSupply = invoice.place_of_supply || customer.place_of_supply || customer.state || "Karnataka";

          let totalTaxable = 0;
          let totalCgst = 0;
          let totalSgst = 0;
          let totalIgst = 0;
          const resolvedItems = [];

          for (const item of items) {
            if (!item.product_id) {
              return jsonResponse({ error: "product_id is required for all line items" }, 400);
            }
            const product = db.prepare("SELECT p.*, r.rate FROM products p JOIN gst_rates r ON p.gst_rate_id = r.id WHERE p.id = ?;").get(item.product_id) as any;
            if (!product) {
              return jsonResponse({ error: `Product with ID ${item.product_id} not found` }, 400);
            }

            const qty = parseFloat(item.quantity || 0);
            if (qty <= 0) {
              return jsonResponse({ error: "quantity must be greater than 0" }, 400);
            }
            const price = item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(product.selling_price || 0.0);
            const taxableVal = item.taxable_value !== undefined ? parseFloat(item.taxable_value) : (qty * price);
            const gstRate = item.gst_rate !== undefined ? parseFloat(item.gst_rate) : parseFloat(product.rate || 0.0);
            const taxAmount = (taxableVal * gstRate) / 100;
            
            let cgst = 0;
            let sgst = 0;
            let igst = 0;
            if (isInterState) {
              igst = taxAmount;
            } else {
              cgst = taxAmount / 2;
              sgst = taxAmount / 2;
            }
            const lineTotal = taxableVal + taxAmount;

            totalTaxable += taxableVal;
            totalCgst += cgst;
            totalSgst += sgst;
            totalIgst += igst;

            resolvedItems.push({
              product_id: product.id,
              product_name: product.name,
              hsn_sac_code: product.hsn_sac_code || "",
              quantity: qty,
              unit: item.unit || product.unit || "PCS",
              unit_price: price,
              taxable_value: taxableVal,
              gst_rate: gstRate,
              cgst_amount: cgst,
              sgst_amount: sgst,
              igst_amount: igst,
              total_amount: lineTotal
            });
          }

          const rawGrandTotal = totalTaxable + totalCgst + totalSgst + totalIgst;
          const grandTotal = Math.round(rawGrandTotal);
          const roundOff = parseFloat((grandTotal - rawGrandTotal).toFixed(2));

          const invoiceId = invoice.invoice_number || getNextInvoiceNumber();
          const invoicePayload = {
            id: invoiceId,
            invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
            customer_id: customerId,
            place_of_supply: placeOfSupply,
            notes: invoice.notes || "Recorded via External API",
            taxable_value: totalTaxable,
            cgst_amount: totalCgst,
            sgst_amount: totalSgst,
            igst_amount: totalIgst,
            round_off: roundOff,
            grand_total: grandTotal,
            status: invoice.status || "Draft"
          };

          createInvoice(invoicePayload, resolvedItems);
          return jsonResponse({ success: true, id: invoiceId, message: "Invoice created successfully via API", invoice: invoicePayload }, 201);
        }

        return jsonResponse({ error: "API Endpoint Not Found" }, 404);
      } catch (err: any) {
        console.error("External API Error:", err);
        return jsonResponse({ error: err.message || "Failed to process API request" }, 500);
      }
    }

    // --- API: Save Settings ---
    if (url.pathname === "/api/settings/save" && method === "POST") {
      try {
        const body = await req.json();
        for (const key of Object.keys(body)) {
          updateSetting(key, String(body[key]));
        }
        return jsonResponse({ success: true, settings: getSettings() });
      } catch (err: any) {
        console.error("API Save Settings Error:", err);
        return jsonResponse({ error: err.message || "Failed to save settings" }, 500);
      }
    }

    // --- API: Status Check ---
    if (url.pathname === "/api/status" && method === "GET") {
      try {
        const initialized = isDbInitialized || isDatabaseFileExisting();
        const settings = initialized ? getSettings() : {};
        return jsonResponse({
          status: "OK",
          runtime: "Bun",
          database: "SQLite (bun:sqlite)",
          db_path: dbPath,
          initialized: initialized,
          settings: settings
        });
      } catch (err: any) {
        console.error("API Status Error:", err);
        return jsonResponse({ status: "ERROR", message: "Failed to read configuration settings" }, 500);
      }
    }

    // --- API: First-Time Database Initialization ---
    if (url.pathname === "/api/init-db" && method === "POST") {
      try {
        initializeDatabase();
        const settings = getSettings();
        return jsonResponse({
          success: true,
          message: "Database created and initialized successfully",
          db_path: dbPath,
          initialized: true,
          settings: settings
        });
      } catch (err: any) {
        console.error("API Init DB Error:", err);
        return jsonResponse({ error: err.message || "Failed to initialize database" }, 500);
      }
    }

    // --- API: GST Rates List ---
    if (url.pathname === "/api/gst-rates" && method === "GET") {
      try {
        const rates = getGstRates();
        return jsonResponse(rates);
      } catch (err: any) {
        console.error("Failed to fetch GST rates:", err);
        return jsonResponse({ error: "Failed to fetch GST rates from DB" }, 500);
      }
    }

    // --- API: Next Customer ID ---
    if (url.pathname === "/api/customers/next-id" && method === "GET") {
      try {
        const nextId = getNextCustomerId();
        return jsonResponse({ nextId });
      } catch (err: any) {
        console.error("Failed to generate next customer ID:", err);
        return jsonResponse({ error: "Internal server error generating ID" }, 500);
      }
    }

    // --- API: Customers Module ---
    if (url.pathname === "/api/customers") {
      // 1. GET Customers List
      if (method === "GET") {
        try {
          const list = getCustomers();
          return jsonResponse(list);
        } catch (err: any) {
          console.error("GET Customers error:", err);
          return jsonResponse({ error: "Internal server error reading customers" }, 500);
        }
      }
      
      // 2. POST Create Customer
      if (method === "POST") {
        try {
          const body = await req.json();
          
          // Validation: id and name are mandatory
          if (!body.id || !body.id.trim()) {
            return jsonResponse({ error: "Customer ID is required" }, 400);
          }
          if (!body.name || !body.name.trim()) {
            return jsonResponse({ error: "Customer Name is required" }, 400);
          }

          // Validation: GSTIN format check
          if (body.gstin && body.gstin.trim()) {
            const formattedGstin = body.gstin.trim().toUpperCase();
            if (!GSTIN_REGEX.test(formattedGstin)) {
              return jsonResponse({ error: "Invalid GSTIN format. Expected e.g. 29AAAAA0000A1Z5" }, 400);
            }
            body.gstin = formattedGstin;
            
            // Auto-correct/validate state code matching first 2 digits of GSTIN
            const gstinStateCode = formattedGstin.substring(0, 2);
            if (body.state_code && body.state_code.trim() !== gstinStateCode) {
              return jsonResponse({ error: `GSTIN prefix (${gstinStateCode}) does not match selected State Code (${body.state_code})` }, 400);
            }
          }

          createCustomer(body);
          return jsonResponse({ success: true, message: "Customer created successfully" }, 201);
        } catch (err: any) {
          console.error("POST Customer error:", err);
          if (err.message && err.message.includes("UNIQUE constraint failed")) {
            return jsonResponse({ error: "Customer with this ID already exists" }, 409);
          }
          return jsonResponse({ error: err.message || "Failed to create customer" }, 500);
        }
      }

      // 3. PUT Update Customer
      if (method === "PUT") {
        try {
          const id = url.searchParams.get("id");
          if (!id) {
            return jsonResponse({ error: "Customer ID query parameter 'id' is required" }, 400);
          }
          const body = await req.json();
          if (!body.name || !body.name.trim()) {
            return jsonResponse({ error: "Customer Name is required" }, 400);
          }

          if (body.gstin && body.gstin.trim()) {
            const formattedGstin = body.gstin.trim().toUpperCase();
            if (!GSTIN_REGEX.test(formattedGstin)) {
              return jsonResponse({ error: "Invalid GSTIN format" }, 400);
            }
            body.gstin = formattedGstin;
          }

          updateCustomer(id, body);
          return jsonResponse({ success: true, message: "Customer updated successfully" });
        } catch (err: any) {
          console.error("PUT Customer error:", err);
          return jsonResponse({ error: err.message || "Failed to update customer" }, 500);
        }
      }

      // 4. DELETE Customer
      if (method === "DELETE") {
        try {
          const id = url.searchParams.get("id");
          if (!id) {
            return jsonResponse({ error: "Customer ID query parameter 'id' is required" }, 400);
          }
          deleteCustomer(id);
          return jsonResponse({ success: true, message: "Customer deleted successfully" });
        } catch (err: any) {
          console.error("DELETE Customer error:", err);
          return jsonResponse({ error: err.message }, 400);
        }
      }
    }

    // 5. GET Customer Autocomplete/Search
    if (url.pathname === "/api/customers/search" && method === "GET") {
      try {
        const q = url.searchParams.get("q") || "";
        const list = searchCustomers(q);
        return jsonResponse(list);
      } catch (err: any) {
        console.error("Search Customers error:", err);
        return jsonResponse({ error: "Failed to search customers" }, 500);
      }
    }

    // --- API: Products Module ---
    if (url.pathname === "/api/products") {
      // 1. GET Products List
      if (method === "GET") {
        try {
          const list = getProducts();
          return jsonResponse(list);
        } catch (err: any) {
          console.error("GET Products error:", err);
          return jsonResponse({ error: "Failed to read products catalog" }, 500);
        }
      }

      // 2. POST Create Product
      if (method === "POST") {
        try {
          const body = await req.json();
          if (!body.id || !body.id.trim()) {
            return jsonResponse({ error: "Product SKU / ID is required" }, 400);
          }
          if (!body.name || !body.name.trim()) {
            return jsonResponse({ error: "Product Name is required" }, 400);
          }
          if (!body.gst_rate_id) {
            return jsonResponse({ error: "Product GST Rate selection is required" }, 400);
          }

          createProduct(body);
          return jsonResponse({ success: true, message: "Product added to catalog" }, 201);
        } catch (err: any) {
          console.error("POST Product error:", err);
          if (err.message && err.message.includes("UNIQUE constraint failed")) {
            return jsonResponse({ error: "Product SKU / ID already exists" }, 409);
          }
          return jsonResponse({ error: err.message || "Failed to create product" }, 500);
        }
      }

      // 3. PUT Update Product
      if (method === "PUT") {
        try {
          const id = url.searchParams.get("id");
          if (!id) {
            return jsonResponse({ error: "Product ID parameter 'id' is required" }, 400);
          }
          const body = await req.json();
          if (!body.name || !body.name.trim()) {
            return jsonResponse({ error: "Product Name is required" }, 400);
          }
          if (!body.gst_rate_id) {
            return jsonResponse({ error: "Product GST Rate selection is required" }, 400);
          }

          updateProduct(id, body);
          return jsonResponse({ success: true, message: "Product updated in catalog" });
        } catch (err: any) {
          console.error("PUT Product error:", err);
          return jsonResponse({ error: err.message || "Failed to update product" }, 500);
        }
      }

      // 4. DELETE Product (Archive)
      if (method === "DELETE") {
        try {
          const id = url.searchParams.get("id");
          if (!id) {
            return jsonResponse({ error: "Product ID parameter 'id' is required" }, 400);
          }
          archiveProduct(id);
          return jsonResponse({ success: true, message: "Product archived successfully" });
        } catch (err: any) {
          console.error("DELETE Product error:", err);
          return jsonResponse({ error: err.message }, 500);
        }
      }
    }

    // --- API: Adjust Product Stock ---
    if (url.pathname === "/api/products/adjust-stock" && method === "POST") {
      try {
        const body = await req.json();
        if (!body.product_id || body.delta === undefined) {
          return jsonResponse({ error: "Product ID and delta are required" }, 400);
        }
        const newStock = adjustProductStock(body.product_id, parseFloat(body.delta));
        return jsonResponse({ success: true, current_stock: newStock });
      } catch (err: any) {
        console.error("Post adjust stock error:", err);
        return jsonResponse({ error: err.message || "Failed to adjust product stock" }, 500);
      }
    }

    // 5. GET Products Autocomplete/Search
    if (url.pathname === "/api/products/search" && method === "GET") {
      try {
        const q = url.searchParams.get("q") || "";
        const list = searchProducts(q);
        return jsonResponse(list);
      } catch (err: any) {
        console.error("Search Products error:", err);
        return jsonResponse({ error: "Failed to search products" }, 500);
      }
    }

    // --- API: Invoices Module ---
    if (url.pathname === "/api/invoices") {
      // 1. GET Invoices List
      if (method === "GET") {
        try {
          const list = getInvoices();
          return jsonResponse(list);
        } catch (err: any) {
          console.error("GET Invoices error:", err);
          return jsonResponse({ error: "Failed to read invoices" }, 500);
        }
      }

      // 2. POST Create Invoice
      if (method === "POST") {
        try {
          const body = await req.json();
          const { invoice, items } = body;
          
          if (!invoice || !invoice.customer_id || !invoice.invoice_date || !items || !Array.isArray(items) || items.length === 0) {
            return jsonResponse({ error: "Missing required invoice fields or line items" }, 400);
          }

          // Generate next ID
          const nextInvId = getNextInvoiceNumber();
          invoice.id = nextInvId;

          createInvoice(invoice, items);
          return jsonResponse({ success: true, id: nextInvId, message: "Invoice created successfully" }, 201);
        } catch (err: any) {
          console.error("POST Invoice error:", err);
          return jsonResponse({ error: err.message || "Failed to create invoice" }, 500);
        }
      }

      // 3. DELETE Invoice
      if (method === "DELETE") {
        try {
          const id = url.searchParams.get("id");
          if (!id) {
            return jsonResponse({ error: "Invoice ID query parameter 'id' is required" }, 400);
          }
          deleteInvoice(id);
          return jsonResponse({ success: true, message: "Invoice deleted successfully" });
        } catch (err: any) {
          console.error("DELETE Invoice error:", err);
          return jsonResponse({ error: err.message || "Failed to delete invoice" }, 500);
        }
      }
    }

    // 4. GET Next Invoice Number
    if (url.pathname === "/api/invoices/next-number" && method === "GET") {
      try {
        const nextNumber = getNextInvoiceNumber();
        return jsonResponse({ nextNumber });
      } catch (err: any) {
        console.error("Failed to generate next invoice number:", err);
        return jsonResponse({ error: "Failed to generate next invoice number" }, 500);
      }
    }

    // 5. GET Invoice Detail
    if (url.pathname === "/api/invoices/detail" && method === "GET") {
      try {
        const id = url.searchParams.get("id");
        if (!id) {
          return jsonResponse({ error: "Invoice ID query parameter 'id' is required" }, 400);
        }
        const detail = getInvoice(id);
        if (!detail) {
          return jsonResponse({ error: "Invoice not found" }, 404);
        }
        return jsonResponse(detail);
      } catch (err: any) {
        console.error("GET Invoice Detail error:", err);
        return jsonResponse({ error: "Failed to read invoice details" }, 500);
      }
    }

    // 6. PUT Update Invoice Status
    if (url.pathname === "/api/invoices/status" && method === "PUT") {
      try {
        const body = await req.json();
        if (!body.id || !body.status) {
          return jsonResponse({ error: "Both invoice ID and status parameters are required" }, 400);
        }
        updateInvoiceStatus(body.id, body.status);
        return jsonResponse({ success: true, message: "Invoice status updated successfully" });
      } catch (err: any) {
        console.error("PUT Invoice Status error:", err);
        return jsonResponse({ error: err.message || "Failed to update invoice status" }, 500);
      }
    }

    // --- API: Payments Module ---
    if (url.pathname === "/api/payments" && method === "POST") {
      try {
        const body = await req.json();
        if (!body.invoice_number || !body.amount || !body.payment_date || !body.payment_method) {
          return jsonResponse({ error: "Missing required payment fields: invoice_number, amount, payment_date, payment_method" }, 400);
        }
        recordPayment(body);
        return jsonResponse({ success: true, message: "Payment recorded successfully" }, 201);
      } catch (err: any) {
        console.error("POST Payment error:", err);
        return jsonResponse({ error: err.message || "Failed to record payment" }, 500);
      }
    }

    // --- API: Suppliers Module ---
    if (url.pathname === "/api/suppliers" && method === "GET") {
      try {
        const suppliers = getSuppliers();
        return jsonResponse(suppliers);
      } catch (err: any) {
        return jsonResponse({ error: "Failed to fetch suppliers" }, 500);
      }
    }

    if (url.pathname === "/api/suppliers" && method === "POST") {
      try {
        const body = await req.json();
        if (!body.name) {
          return jsonResponse({ error: "Supplier name is required" }, 400);
        }
        createSupplier(body);
        return jsonResponse({ success: true, message: "Supplier added successfully" }, 201);
      } catch (err: any) {
        return jsonResponse({ error: err.message || "Failed to create supplier" }, 500);
      }
    }

    // --- API: Purchases Module ---
    if (url.pathname === "/api/purchases" && method === "GET") {
      try {
        const purchases = getPurchases();
        return jsonResponse(purchases);
      } catch (err: any) {
        return jsonResponse({ error: "Failed to fetch purchases" }, 500);
      }
    }

    if (url.pathname === "/api/purchases/next-number" && method === "GET") {
      try {
        const nextNum = getNextPurchaseNumber();
        return jsonResponse({ next_number: nextNum });
      } catch (err: any) {
        return jsonResponse({ error: "Failed to fetch next purchase sequence number" }, 500);
      }
    }

    if (url.pathname === "/api/purchases/detail" && method === "GET") {
      try {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "Purchase ID is required" }, 400);
        const detail = getPurchase(id);
        if (!detail) return jsonResponse({ error: "Purchase not found" }, 404);
        return jsonResponse(detail);
      } catch (err: any) {
        return jsonResponse({ error: "Failed to fetch purchase details" }, 500);
      }
    }

    if (url.pathname === "/api/purchases" && method === "POST") {
      try {
        const body = await req.json();
        if (!body.purchase || !body.items || !body.purchase.id || !body.purchase.supplier_id) {
          return jsonResponse({ error: "Missing required purchase header or item payload fields" }, 400);
        }
        createPurchase(body.purchase, body.items);
        return jsonResponse({ success: true, message: "Purchase invoice recorded successfully" }, 201);
      } catch (err: any) {
        return jsonResponse({ error: err.message || "Failed to record purchase" }, 500);
      }
    }

    if (url.pathname === "/api/purchases" && method === "DELETE") {
      try {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "Purchase ID parameter is required" }, 400);
        deletePurchase(id);
        return jsonResponse({ success: true, message: "Purchase record deleted successfully" });
      } catch (err: any) {
        return jsonResponse({ error: err.message || "Failed to delete purchase" }, 500);
      }
    }

    // --- API: Expenses Module ---
    if (url.pathname === "/api/expenses" && method === "GET") {
      try {
        const expenses = getExpenses();
        return jsonResponse(expenses);
      } catch (err: any) {
        return jsonResponse({ error: "Failed to fetch expenses" }, 500);
      }
    }

    if (url.pathname === "/api/expenses" && method === "POST") {
      try {
        const body = await req.json();
        if (!body.category || !body.amount || !body.expense_date || !body.payment_method) {
          return jsonResponse({ error: "Missing required expense parameters: category, amount, expense_date, payment_method" }, 400);
        }
        const insertedId = createExpense(body);
        return jsonResponse({ success: true, id: insertedId, message: "Expense logged successfully" }, 201);
      } catch (err: any) {
        return jsonResponse({ error: err.message || "Failed to create expense" }, 500);
      }
    }

    if (url.pathname === "/api/expenses" && method === "DELETE") {
      try {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "Expense ID is required" }, 400);
        deleteExpense(parseInt(id));
        return jsonResponse({ success: true, message: "Expense record deleted successfully" });
      } catch (err: any) {
        return jsonResponse({ error: err.message || "Failed to delete expense" }, 500);
      }
    }

    // --- API: Attachments Upload (Secure local file storage) ---
    if (url.pathname === "/api/upload" && method === "POST") {
      try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const entityType = formData.get("entity_type") as string;
        const entityId = formData.get("entity_id") as string;

        if (!file || !entityType || !entityId) {
          return jsonResponse({ error: "Missing required upload parameters: file, entity_type, entity_id" }, 400);
        }

        const cleanName = basename(file.name);
        const timestamp = Date.now();
        const uniqueFilename = `${timestamp}_${cleanName}`;
        const filePath = `/attachments/${uniqueFilename}`;
        const absolutePath = join("./attachments", uniqueFilename);

        const bytes = await file.arrayBuffer();
        await writeFile(absolutePath, Buffer.from(bytes));

        // Insert attachment link details if not logo
        if (entityType !== "logo") {
          createAttachment({
            entity_type: entityType,
            entity_id: entityId,
            file_name: cleanName,
            file_path: filePath,
            mime_type: file.type
          });
        }

        return jsonResponse({ success: true, file_path: filePath });
      } catch (err: any) {
        console.error("POST Upload error:", err);
        return jsonResponse({ error: err.message || "Failed to upload file" }, 500);
      }
    }

    // --- API: Dashboard Metrics ---
    if (url.pathname === "/api/dashboard/metrics" && method === "GET") {
      try {
        const metrics = getDashboardMetrics();
        return jsonResponse(metrics);
      } catch (err: any) {
        console.error("GET Dashboard metrics error:", err);
        return jsonResponse({ error: "Failed to compile dashboard metrics" }, 500);
      }
    }

    // --- API: GST Reports ---
    if (url.pathname === "/api/reports/gst" && method === "GET") {
      try {
        let fromDate = "";
        let toDate = "";

        const month = url.searchParams.get("month");
        const quarter = url.searchParams.get("quarter"); // YYYY-QX
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        if (month) {
          fromDate = `${month}-01`;
          const [year, m] = month.split("-").map(Number);
          const endDay = new Date(year, m, 0).getDate();
          toDate = `${month}-${String(endDay).padStart(2, "0")}`;
        } else if (quarter) {
          const parts = quarter.split("-");
          if (parts.length !== 2) {
            return jsonResponse({ error: "Invalid quarter format. Expected YYYY-QX" }, 400);
          }
          const year = parts[0];
          const q = parts[1];
          if (q === "Q1") {
            fromDate = `${year}-01-01`;
            toDate = `${year}-03-31`;
          } else if (q === "Q2") {
            fromDate = `${year}-04-01`;
            toDate = `${year}-06-30`;
          } else if (q === "Q3") {
            fromDate = `${year}-07-01`;
            toDate = `${year}-09-30`;
          } else if (q === "Q4") {
            fromDate = `${year}-10-01`;
            toDate = `${year}-12-31`;
          } else {
            return jsonResponse({ error: "Invalid quarter. Must be Q1, Q2, Q3, or Q4" }, 400);
          }
        } else if (from && to) {
          fromDate = from;
          toDate = to;
        } else {
          return jsonResponse({ error: "Filing period required. Pass either ?month=YYYY-MM, ?quarter=YYYY-QX, or ?from=YYYY-MM-DD&to=YYYY-MM-DD" }, 400);
        }

        const report = getGstReportForPeriod(fromDate, toDate);
        return jsonResponse(report);
      } catch (err: any) {
        console.error("GET GST Report error:", err);
        return jsonResponse({ error: "Failed to compile GST report aggregates" }, 500);
      }
    }

    // --- API: Filing Registers & Period Summaries ---
    if (url.pathname === "/api/reports/registers" && method === "GET") {
      try {
        let fromDate = "";
        let toDate = "";

        const month = url.searchParams.get("month");
        const quarter = url.searchParams.get("quarter"); // YYYY-QX
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        if (month) {
          fromDate = `${month}-01`;
          const [year, m] = month.split("-").map(Number);
          const endDay = new Date(year, m, 0).getDate();
          toDate = `${month}-${String(endDay).padStart(2, "0")}`;
        } else if (quarter) {
          const parts = quarter.split("-");
          if (parts.length !== 2) {
            return jsonResponse({ error: "Invalid quarter format. Expected YYYY-QX" }, 400);
          }
          const year = parts[0];
          const q = parts[1];
          if (q === "Q1") {
            fromDate = `${year}-01-01`;
            toDate = `${year}-03-31`;
          } else if (q === "Q2") {
            fromDate = `${year}-04-01`;
            toDate = `${year}-06-30`;
          } else if (q === "Q3") {
            fromDate = `${year}-07-01`;
            toDate = `${year}-09-30`;
          } else if (q === "Q4") {
            fromDate = `${year}-10-01`;
            toDate = `${year}-12-31`;
          } else {
            return jsonResponse({ error: "Invalid quarter selection." }, 400);
          }
        } else if (from && to) {
          fromDate = from;
          toDate = to;
        } else {
          return jsonResponse({ error: "Filing period required. Pass either ?month=YYYY-MM, ?quarter=YYYY-QX, or ?from=YYYY-MM-DD&to=YYYY-MM-DD" }, 400);
        }

        const report = getFilingRegistersReport(fromDate, toDate);
        return jsonResponse(report);
      } catch (err: any) {
        console.error("GET Filing Registers report error:", err);
        return jsonResponse({ error: err.message || "Failed to compile registers" }, 500);
      }
    }

    // --- API: GSTR-1 JSON Export ---
    if (url.pathname === "/api/reports/gstr1-json" && method === "GET") {
      try {
        let fromDate = "";
        let toDate = "";
        let fp = ""; // Return filing period MMYYYY

        const month = url.searchParams.get("month");
        const quarter = url.searchParams.get("quarter"); // YYYY-QX
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        if (month) {
          // Format: YYYY-MM
          fromDate = `${month}-01`;
          const [year, m] = month.split("-").map(Number);
          const endDay = new Date(year, m, 0).getDate();
          toDate = `${month}-${String(endDay).padStart(2, "0")}`;
          fp = `${String(m).padStart(2, "0")}${year}`;
        } else if (quarter) {
          // Format: YYYY-Q1/Q2/Q3/Q4
          const parts = quarter.split("-");
          if (parts.length !== 2) {
            return jsonResponse({ error: "Invalid quarter format. Expected YYYY-QX (e.g. 2026-Q1)" }, 400);
          }
          const year = parts[0];
          const q = parts[1];
          if (q === "Q1") {
            fromDate = `${year}-01-01`;
            toDate = `${year}-03-31`;
            fp = `03${year}`;
          } else if (q === "Q2") {
            fromDate = `${year}-04-01`;
            toDate = `${year}-06-30`;
            fp = `06${year}`;
          } else if (q === "Q3") {
            fromDate = `${year}-07-01`;
            toDate = `${year}-09-30`;
            fp = `09${year}`;
          } else if (q === "Q4") {
            fromDate = `${year}-10-01`;
            toDate = `${year}-12-31`;
            fp = `12${year}`;
          } else {
            return jsonResponse({ error: "Invalid quarter selection. Must be Q1, Q2, Q3, or Q4" }, 400);
          }
        } else if (from && to) {
          // Format: YYYY-MM-DD
          fromDate = from;
          toDate = to;
          const parts = to.split("-");
          if (parts.length !== 3) {
            return jsonResponse({ error: "Invalid date format. Expected YYYY-MM-DD" }, 400);
          }
          fp = `${parts[1]}${parts[0]}`;
        } else {
          return jsonResponse({ error: "Filing period required. Pass either ?month=YYYY-MM, ?quarter=YYYY-QX, or ?from=YYYY-MM-DD&to=YYYY-MM-DD" }, 400);
        }

        const settings = getSettings();
        const merchantGstin = settings.biz_gst || "";
        if (!merchantGstin) {
          return jsonResponse({ error: "Merchant GSTIN is not configured in Settings. Please set your GSTIN before generating returns." }, 400);
        }

        // Query database records for the target range
        const dbInvoices = getInvoicesForPeriod(fromDate, toDate);
        
        // Map database records to the independent generator schema
        const generatorInvoices = dbInvoices.map(inv => {
          const items = inv.items.map((item: any) => ({
            hsn_sc: item.hsn_sac_code || "9999",
            description: item.description || "Product Supply",
            uqc: item.unit || "PCS",
            qty: item.quantity || 1.0,
            txval: item.taxable_value || 0.0,
            rt: item.gst_rate || 0.0,
            iamt: item.igst || 0.0,
            camt: item.cgst || 0.0,
            samt: item.sgst || 0.0,
            csamt: 0.0
          }));

          return {
            inum: inv.invoice_number,
            idt: inv.invoice_date,
            val: inv.grand_total,
            pos: String(inv.place_of_supply || "29").padStart(2, "0"),
            rchrg: "N" as const,
            inv_typ: "R" as const,
            customer_name: inv.customer_name || "Consumer",
            customer_gstin: inv.customer_gstin || undefined,
            items
          };
        });

        const generatorPayload = {
          gstin: merchantGstin,
          fp: fp,
          gt: 0.0,
          cur_gt: 0.0,
          invoices: generatorInvoices
        };

        // Invoke the pure verification engine
        const genResult = generateGstr1(generatorPayload);
        if (!genResult.success) {
          return jsonResponse({
            error: "GSTR-1 JSON validation failed for the selected period.",
            validationErrors: genResult.errors
          }, 422);
        }

        return jsonResponse(genResult.json);
      } catch (err: any) {
        console.error("GSTR-1 JSON Generation error:", err);
        return jsonResponse({ error: err.message || "Failed to generate GSTR-1 return" }, 500);
      }
    }

    // --- API: Payments Ledger ---
    if (url.pathname === "/api/payments/ledger" && method === "GET") {
      try {
        const ledger = getPaymentsLedger();
        return jsonResponse(ledger);
      } catch (err: any) {
        console.error("GET Payments Ledger error:", err);
        return jsonResponse({ error: "Failed to retrieve ledger entries" }, 500);
      }
    }

    // --- API: Backup Utility ---
    if (url.pathname === "/api/backup" && method === "GET") {
      try {
        const relDbPath = relative(process.cwd(), dbPath);
        // Quietly zip the database and local files attachments folder recursively
        const proc = spawnSync("zip", ["-r", "-q", zipPath, relDbPath, "attachments"]);
        if (proc.status !== 0) {
          throw new Error(proc.stderr?.toString() || "Failed to package database and attachments");
        }
        
        const file = Bun.file(zipPath);
        const fileData = await file.arrayBuffer();
        
        // Clean up backup zip file locally
        try { unlinkSync(zipPath); } catch (e) {}
        
        return new Response(fileData, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="invoicery_backup.zip"',
            "Cache-Control": "no-store, no-cache, must-revalidate"
          }
        });
      } catch (err: any) {
        console.error("GET Backup error:", err);
        return jsonResponse({ error: err.message || "Failed to generate zip backup" }, 500);
      }
    }

    // --- API: Restore Utility ---
    if (url.pathname === "/api/restore" && method === "POST") {
      try {
        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
          return jsonResponse({ error: "Expected multipart/form-data content type" }, 400);
        }
        
        const formData = await req.formData();
        const file = formData.get("backup") as File | null;
        if (!file) {
          return jsonResponse({ error: "Missing backup zip file attachment" }, 400);
        }
        
        const restoreZipPath = "/tmp/restore_upload.zip";
        const bytes = await file.arrayBuffer();
        await writeFile(restoreZipPath, Buffer.from(bytes));
        
        // 1. Close current db file handles
        reopenDatabase(); // Close old instance
        const { db } = require("./database"); // import reference
        try { db.close(); } catch(e){}
        
        // 2. Unzip backup archive overwriting files
        const proc = spawnSync("unzip", ["-o", "-q", restoreZipPath, "-d", "."]);
        
        // 3. Restart SQLite connection
        reopenDatabase();
        
        // Clean up upload temp zip file
        try { unlinkSync(restoreZipPath); } catch (e) {}
        
        if (proc.status !== 0) {
          throw new Error(proc.stderr?.toString() || "Failed to extract backup zip archive");
        }
        
        return jsonResponse({ success: true, message: "System backup restored successfully! Reloading..." });
      } catch (err: any) {
        console.error("POST Restore error:", err);
        try { reopenDatabase(); } catch(e){}
        return jsonResponse({ error: err.message || "Failed to restore backup zip archive" }, 500);
      }
    }

    // --- 404 Response ---
    return new Response("Not Found", { 
      status: 404,
      headers: { "Content-Type": "text/plain" }
    });
  },
  error(error) {
    console.error("Server uncaught exception:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

console.log(`🚀 Personal Billing & GST Assistant running at http://${server.hostname}:${server.port}`);
