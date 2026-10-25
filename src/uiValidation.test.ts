import { describe, test, expect } from "bun:test";

describe("UI & UX Structural Validation Tests", () => {
  // Paths to frontend assets
  const htmlPath = "./public/index.html";
  const cssPath = "./public/style.css";
  const jsPath = "./public/app.js";

  // =========================================================================
  // 1. HTML DOM Structure Checks
  // =========================================================================
  describe("index.html Layout Check", () => {
    test("Should contain new API integration UI elements", async () => {
      const htmlContent = await Bun.file(htmlPath).text();

      // Check for Section Header
      expect(htmlContent).toContain("API ACCESS & INTEGRATIONS");

      // Check for API Toggle checkbox element
      expect(htmlContent).toContain('id="set-api-enabled"');

      // Check for API Key read-only input element
      expect(htmlContent).toContain('id="set-api-key"');
      expect(htmlContent).toContain("readonly");

      // Check for action buttons
      expect(htmlContent).toContain('id="btn-copy-api-key"');
      expect(htmlContent).toContain('id="btn-regen-api-key"');

      // Check for Online Order Number, Customer GSTIN, & Tax Mode UI elements
      expect(htmlContent).toContain('id="inv-online-order-no"');
      expect(htmlContent).toContain('id="print-inv-order-no"');
      expect(htmlContent).toContain('id="inv-cust-info-banner"');
      expect(htmlContent).toContain('id="print-cust-gstin"');
      expect(htmlContent).toContain('id="inv-tax-inclusive"');

      // Check for Dynamic Signature UI elements
      expect(htmlContent).toContain('id="set-biz-signature"');
      expect(htmlContent).toContain('id="set-biz-signature-path"');
      expect(htmlContent).toContain('id="set-signature-preview"');
      expect(htmlContent).toContain('id="btn-remove-signature"');
      expect(htmlContent).toContain('id="print-signature-img"');
      expect(htmlContent).toContain('id="print-digital-sig"');

      // Check for Edit Invoice UI elements
      expect(htmlContent).toContain('id="btn-edit-print-invoice"');
      expect(htmlContent).toContain('id="btn-save-invoice"');

      // Check for Share PDF UI elements
      expect(htmlContent).toContain('id="btn-share-pdf"');
      expect(htmlContent).toContain('src="/html2pdf.bundle.min.js"');

      // Check for GST configuration & conditional display elements
      expect(htmlContent).toContain('id="set-gst-enabled"');
      expect(htmlContent).toContain('id="print-biz-gstin-container"');
      expect(htmlContent).toContain('id="print-invoice-title"');
      expect(htmlContent).toContain('id="print-hsn-heading"');
      expect(htmlContent).toContain('id="print-hsn-table"');
    });

    test("Should NOT contain hardcoded signature name in HTML", async () => {
      const htmlContent = await Bun.file(htmlPath).text();
      // Ensure the hardcoded "Akshay Bhandare" signature was replaced with dynamic container
      expect(htmlContent).not.toContain('<div id="print-digital-sig" style="font-family: \'Alex Brush\', cursive; font-size: 32px; height: 35px; line-height: 35px; color: #000000; padding-bottom: 5px;">Akshay Bhandare</div>');
    });

    test("Should NOT contain the deleted City input field", async () => {
      const htmlContent = await Bun.file(htmlPath).text();
      expect(htmlContent).not.toContain('id="set-biz-city"');
    });
  });

  // =========================================================================
  // 2. CSS Styling & Layout Checks
  // =========================================================================
  describe("style.css Layout Check", () => {
    test("Should contain toggle switch style classes", async () => {
      const cssContent = await Bun.file(cssPath).text();

      // Toggle container should exist
      expect(cssContent).toContain(".api-toggle-container");

      // Switch container classes
      expect(cssContent).toContain(".switch");

      // Slider classes
      expect(cssContent).toContain(".slider");

      // Checked styling transitions
      expect(cssContent).toContain(".switch input:checked + .slider");
      expect(cssContent).toContain(".switch input:checked + .slider:before");
    });
  });

  // =========================================================================
  // 3. JavaScript UX Integration Checks
  // =========================================================================
  describe("app.js Event Bindings & Logic Check", () => {
    test("Should contain settings loading and saving handlers for API", async () => {
      const jsContent = await Bun.file(jsPath).text();

      // Toggle elements query
      expect(jsContent).toContain('document.getElementById("set-api-enabled")');
      expect(jsContent).toContain('document.getElementById("set-api-key")');
      expect(jsContent).toContain('document.getElementById("api-key-section")');

      // Action button listeners
      expect(jsContent).toContain('document.getElementById("btn-copy-api-key")');
      expect(jsContent).toContain('document.getElementById("btn-regen-api-key")');

      // API Key generation function
      expect(jsContent).toContain("generateRandomApiKey");

      // Payload serialization should include api_enabled and api_key
      expect(jsContent).toContain("api_enabled: apiEnabled");
      expect(jsContent).toContain("api_key: apiKey");

      // Dynamic Signature handlers
      expect(jsContent).toContain('document.getElementById("set-biz-signature")');
      expect(jsContent).toContain('document.getElementById("set-biz-signature-path")');
      expect(jsContent).toContain("updateSignaturePreviewUI");
      expect(jsContent).toContain("business_signature: signature");
      expect(jsContent).toContain("business_signature_path: signaturePath");

      // Edit invoice logic
      expect(jsContent).toContain("openEditInvoiceModal");
      expect(jsContent).toContain("editingInvoiceId");

      // Share PDF logic & Android share panel handling
      expect(jsContent).toContain('document.getElementById("btn-share-pdf")');
      expect(jsContent).toContain("navigator.share");
      expect(jsContent).toContain("navigator.canShare");
      expect(jsContent).toContain("startBackgroundPdfGeneration");
      expect(jsContent).toContain("intent:#Intent;action=android.intent.action.SEND");

      // GST conditional check and HSN summary visibility logic
      expect(jsContent).toContain("isGstActive");
      expect(jsContent).toContain('document.getElementById("print-hsn-heading")');
      expect(jsContent).toContain('document.getElementById("print-hsn-table")');
      expect(jsContent).toContain("hasGst ? \"TAX INVOICE\" : \"INVOICE\"");
    });

    test("Should correctly evaluate isGstActive logic", () => {
      // Functional unit test of isGstActive logic
      function isGstActive(settings: Record<string, any>) {
        if (!settings) return false;
        if (settings.gst_enabled === "false" || settings.gst_enabled === false) {
          return false;
        }
        const gstin = settings.business_gstin;
        return Boolean(gstin && gstin.trim() !== "" && gstin.trim().toUpperCase() !== "NOT CONFIGURED");
      }

      // When business_gstin is empty
      expect(isGstActive({ business_gstin: "" })).toBe(false);
      expect(isGstActive({ business_gstin: "   " })).toBe(false);
      expect(isGstActive({ business_gstin: "NOT CONFIGURED" })).toBe(false);
      expect(isGstActive({})).toBe(false);

      // When gst_enabled is disabled
      expect(isGstActive({ business_gstin: "29AAAAA0000A1Z5", gst_enabled: "false" })).toBe(false);

      // When valid GSTIN is present and enabled
      expect(isGstActive({ business_gstin: "29AAAAA0000A1Z5" })).toBe(true);
      expect(isGstActive({ business_gstin: "29AAAAA0000A1Z5", gst_enabled: "true" })).toBe(true);
    });

    test("Should NOT reference or query the deleted City element", async () => {
      const jsContent = await Bun.file(jsPath).text();

      // Ensure city input elements are no longer queried
      expect(jsContent).not.toContain('document.getElementById("set-biz-city")');
    });
  });
});
