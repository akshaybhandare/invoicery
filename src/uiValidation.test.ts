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
    });

    test("Should NOT reference or query the deleted City element", async () => {
      const jsContent = await Bun.file(jsPath).text();

      // Ensure city input elements are no longer queried
      expect(jsContent).not.toContain('document.getElementById("set-biz-city")');
    });
  });
});
