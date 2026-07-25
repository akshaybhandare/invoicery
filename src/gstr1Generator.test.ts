import { describe, test, expect } from "bun:test";
import { generateGstr1, type Gstr1Input } from "./gstr1Generator";

describe("GSTR-1 Generator Test Suite", () => {
  const defaultMerchantGstin = "29DBAPB4400H1Z7"; // Karnataka (State code 29)

  // Helper to create a basic valid GSTR-1 input template
  const createBaseInput = (invoices: any[] = [], cdns: any[] = []): Gstr1Input => ({
    gstin: defaultMerchantGstin,
    fp: "072026",
    gt: 1500000,
    cur_gt: 2000000,
    invoices,
    cdns
  });

  // =========================================================================
  // 1. Tax Calculations (Intrastate vs Interstate)
  // =========================================================================
  describe("Tax Calculations & Rounding", () => {
    test("Intrastate Invoice (CGST + SGST)", () => {
      // Intrastate: POS state code matches Merchant GSTIN state code (29)
      const input = createBaseInput([
        {
          inum: "INV-001",
          idt: "2026-07-25",
          val: 1180.0, // grand total (taxable 1000 + cgst 90 + sgst 90)
          pos: "29",
          rchrg: "N",
          inv_typ: "R",
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            {
              hsn_sc: "123456",
              description: "Widget A",
              uqc: "PCS",
              qty: 10,
              txval: 1000.0,
              rt: 18.0,
              camt: 90.0,
              samt: 90.0,
              iamt: 0.0
            }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2b).toBeDefined();
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.camt).toBe(90.0);
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.samt).toBe(90.0);
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.iamt).toBe(0.0);
    });

    test("Interstate Invoice (IGST)", () => {
      // Interstate: POS state code (27 - Maharashtra) differs from Merchant (29)
      const input = createBaseInput([
        {
          inum: "INV-002",
          idt: "2026-07-25",
          val: 1180.0, // grand total (taxable 1000 + igst 180)
          pos: "27",
          rchrg: "N",
          inv_typ: "R",
          customer_gstin: "27AAAAA0000A1Z5",
          items: [
            {
              hsn_sc: "123456",
              description: "Widget A",
              uqc: "PCS",
              qty: 10,
              txval: 1000.0,
              rt: 18.0,
              iamt: 180.0,
              camt: 0.0,
              samt: 0.0
            }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2b).toBeDefined();
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.iamt).toBe(180.0);
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.camt).toBe(0.0);
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.samt).toBe(0.0);
    });

    test("Tax Rounding to Nearest Paisa", () => {
      // Fractional values to verify rounding
      const input = createBaseInput([
        {
          inum: "INV-003",
          idt: "2026-07-25",
          val: 115.756, // rounded to 115.76
          pos: "29",
          rchrg: "N",
          inv_typ: "R",
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            {
              hsn_sc: "123456",
              description: "Widget B",
              uqc: "PCS",
              qty: 1,
              txval: 98.113, // rounded to 98.11
              rt: 18.0,
              camt: 8.831,  // rounded to 8.83
              samt: 8.831   // rounded to 8.83
            }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      const invoice = result.json.b2b[0].inv[0];
      expect(invoice.val).toBe(115.76);
      expect(invoice.itms[0].itm_det.txval).toBe(98.11);
      expect(invoice.itms[0].itm_det.camt).toBe(8.83);
    });
  });

  // =========================================================================
  // 2. Invoice Classification (B2B, B2CL, B2CS)
  // =========================================================================
  describe("Invoice Classification", () => {
    test("B2B Invoice (Has customer GSTIN)", () => {
      const input = createBaseInput([
        {
          inum: "INV-B2B",
          idt: "2026-07-25",
          val: 5000.0,
          pos: "29",
          rchrg: "N",
          inv_typ: "R",
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            { hsn_sc: "1234", description: "Product X", qty: 1, txval: 4237.29, rt: 18.0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2b).toBeDefined();
      expect(result.json.b2b.length).toBe(1);
      expect(result.json.b2cl).toBeUndefined();
      expect(result.json.b2cs).toBeUndefined();
    });

    test("B2CL (B2C Large) - Interstate, No GSTIN, Grand Total > 250,000", () => {
      const input = createBaseInput([
        {
          inum: "INV-B2CL",
          idt: "2026-07-25",
          val: 260000.0, // > 2.5 Lakhs
          pos: "27", // Interstate (27 != 29)
          rchrg: "N",
          inv_typ: "R",
          items: [
            { hsn_sc: "1234", description: "Large Machine", qty: 1, txval: 220338.98, rt: 18.0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2cl).toBeDefined();
      expect(result.json.b2cl.length).toBe(1);
      expect(result.json.b2b).toBeUndefined();
      expect(result.json.b2cs).toBeUndefined();
    });

    test("B2CS (B2C Small) - Interstate, No GSTIN, Grand Total <= 250,000", () => {
      const input = createBaseInput([
        {
          inum: "INV-B2CS-INTER",
          idt: "2026-07-25",
          val: 240000.0, // <= 2.5 Lakhs
          pos: "27", // Interstate
          rchrg: "N",
          inv_typ: "R",
          items: [
            { hsn_sc: "1234", description: "Machine Parts", qty: 1, txval: 203389.83, rt: 18.0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2cs).toBeDefined();
      expect(result.json.b2cs.length).toBe(1);
      expect(result.json.b2b).toBeUndefined();
      expect(result.json.b2cl).toBeUndefined();
    });

    test("B2CS (B2C Small) - Intrastate, No GSTIN, Grand Total > 250,000", () => {
      // Even if value > 250k, if it's Intrastate (same state), it must fall into B2CS
      const input = createBaseInput([
        {
          inum: "INV-B2CS-INTRA",
          idt: "2026-07-25",
          val: 300000.0, // > 2.5 Lakhs
          pos: "29", // Intrastate (same state)
          rchrg: "N",
          inv_typ: "R",
          items: [
            { hsn_sc: "1234", description: "Local Supply", qty: 1, txval: 254237.28, rt: 18.0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2cs).toBeDefined();
      expect(result.json.b2cs.length).toBe(1);
      expect(result.json.b2b).toBeUndefined();
      expect(result.json.b2cl).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. GST Rate Combinations
  // =========================================================================
  describe("GST Rate Combinations", () => {
    test("Multiple Items with Different Rates on Same Invoice", () => {
      const input = createBaseInput([
        {
          inum: "INV-MULTI-RT",
          idt: "2026-07-25",
          val: 3000.0,
          pos: "29",
          rchrg: "N",
          inv_typ: "R",
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            { hsn_sc: "1111", description: "Food (5%)", qty: 2, txval: 1000.0, rt: 5.0, camt: 25.0, samt: 25.0 },
            { hsn_sc: "2222", description: "Service (18%)", qty: 1, txval: 1000.0, rt: 18.0, camt: 90.0, samt: 90.0 },
            { hsn_sc: "3333", description: "Luxury (28%)", qty: 1, txval: 500.0, rt: 28.0, camt: 70.0, samt: 70.0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      const items = result.json.b2b[0].inv[0].itms;
      expect(items.length).toBe(3); // Should group into 3 rate entries
      
      const rates = items.map((i: any) => i.itm_det.rt);
      expect(rates).toContain(5.0);
      expect(rates).toContain(18.0);
      expect(rates).toContain(28.0);
    });
  });

  // =========================================================================
  // 4. Special Categories (SEZ & Reverse Charge)
  // =========================================================================
  describe("SEZ & Reverse Charge", () => {
    test("SEZ with Payment of Tax (SEWP)", () => {
      const input = createBaseInput([
        {
          inum: "INV-SEZ-01",
          idt: "2026-07-25",
          val: 1180.0,
          pos: "29",
          rchrg: "N",
          inv_typ: "SEWP", // SEZ with payment of tax
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            { hsn_sc: "1234", description: "Supply to SEZ Unit", qty: 1, txval: 1000.0, rt: 18.0, iamt: 180.0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2b[0].inv[0].inv_typ).toBe("SEWP");
    });

    test("SEZ without Payment of Tax (SEWOP)", () => {
      const input = createBaseInput([
        {
          inum: "INV-SEZ-02",
          idt: "2026-07-25",
          val: 1000.0, // No tax charged
          pos: "29",
          rchrg: "N",
          inv_typ: "SEWOP", // SEZ without payment of tax
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            { hsn_sc: "1234", description: "Supply to SEZ Unit", qty: 1, txval: 1000.0, rt: 18.0, iamt: 0, camt: 0, samt: 0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2b[0].inv[0].inv_typ).toBe("SEWOP");
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.iamt).toBe(0.0);
    });

    test("Reverse Charge Invoice", () => {
      const input = createBaseInput([
        {
          inum: "INV-RC-01",
          idt: "2026-07-25",
          val: 1000.0,
          pos: "29",
          rchrg: "Y", // Reverse charge enabled
          inv_typ: "R",
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            { hsn_sc: "1234", description: "GTA Service", qty: 1, txval: 1000.0, rt: 5.0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2b[0].inv[0].rchrg).toBe("Y");
    });
  });

  // =========================================================================
  // 5. Credit Notes & Debit Notes
  // =========================================================================
  describe("Credit Notes & Debit Notes", () => {
    test("Registered Credit/Debit Note (cdnr)", () => {
      const input = createBaseInput([], [
        {
          customer_gstin: "29AAAAA0000A1Z5",
          nt_num: "CN-001",
          nt_dt: "25-07-2026",
          val: 590.0,
          pos: "29",
          ntty: "C", // Credit Note
          items: [{ rt: 18.0, txval: 500.0, camt: 45.0, samt: 45.0 }]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.cdnr).toBeDefined();
      expect(result.json.cdnr.length).toBe(1);
      expect(result.json.cdnur).toBeEmpty();
    });

    test("Unregistered Credit/Debit Note (cdnur)", () => {
      const input = createBaseInput([], [
        {
          nt_num: "CN-002",
          nt_dt: "25-07-2026",
          val: 500.0,
          pos: "27",
          ntty: "C",
          items: [{ rt: 18.0, txval: 423.73, iamt: 76.27 }]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.cdnur).toBeDefined();
      expect(result.json.cdnur.length).toBe(1);
      expect(result.json.cdnr).toBeEmpty();
    });
  });

  // =========================================================================
  // 6. Edge Cases & Validations
  // =========================================================================
  describe("Validation Failures & Boundary Edge Cases", () => {
    test("Zero-Rated or Nil-Rated Items", () => {
      const input = createBaseInput([
        {
          inum: "INV-NIL",
          idt: "2026-07-25",
          val: 100.0,
          pos: "29",
          rchrg: "N",
          inv_typ: "R",
          customer_gstin: "29AAAAA0000A1Z5",
          items: [
            { hsn_sc: "0001", description: "Salt (Nil Rated)", qty: 1, txval: 100.0, rt: 0.0, camt: 0, samt: 0 }
          ]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(true);
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.rt).toBe(0.0);
      expect(result.json.b2b[0].inv[0].itms[0].itm_det.txval).toBe(100.0);
    });

    test("Should Fail on Missing Merchant GSTIN", () => {
      const input = createBaseInput([]);
      input.gstin = ""; // Invalid / Empty

      const result = generateGstr1(input);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Merchant GSTIN is required.");
    });

    test("Should Fail on Invalid Merchant GSTIN Format", () => {
      const input = createBaseInput([]);
      input.gstin = "INVALID_GSTIN";

      const result = generateGstr1(input);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("is invalid (must match 15-character GSTN format)");
    });

    test("Should Fail on Invalid Date Format", () => {
      const input = createBaseInput([
        {
          inum: "INV-BAD-DATE",
          idt: "25-07-2026", // Wrong format (expected YYYY-MM-DD)
          val: 100,
          pos: "29",
          rchrg: "N",
          inv_typ: "R",
          items: [{ hsn_sc: "1234", description: "Item", qty: 1, txval: 100, rt: 18 }]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("must be YYYY-MM-DD format");
    });

    test("Should Fail on Customer GSTIN state mismatch with POS", () => {
      const input = createBaseInput([
        {
          inum: "INV-STATE-MISMATCH",
          idt: "2026-07-25",
          val: 118,
          pos: "29", // POS is Karnataka (29)
          rchrg: "N",
          inv_typ: "R",
          customer_gstin: "27AAAAA0000A1Z5", // Customer is Maharashtra (27)
          items: [{ hsn_sc: "1234", description: "Item", qty: 1, txval: 100, rt: 18 }]
        }
      ]);

      const result = generateGstr1(input);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("does not match Place of Supply state code");
    });
  });
});
