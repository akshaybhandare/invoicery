export interface Gstr1ItemDetail {
  txval: number;      // Taxable Value
  rt: number;         // GST Rate (e.g. 18.0)
  iamt?: number;      // Integrated Tax (IGST)
  camt?: number;      // Central Tax (CGST)
  samt?: number;      // State Tax (SGST)
  csamt?: number;     // Cess
}

export interface Gstr1InvoiceLine {
  hsn_sc: string;     // HSN / SAC Code
  description: string;
  uqc: string;        // Unit Quantity Code (e.g. "PCS", "KGS")
  qty: number;
  txval: number;      // Taxable Value
  rt: number;         // GST Rate (e.g. 18.0)
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt?: number;
}

export interface Gstr1Invoice {
  inum: string;       // Invoice Number
  idt: string;        // Invoice Date (YYYY-MM-DD)
  val: number;        // Invoice Value (grand total)
  pos: string;        // Place of supply state code (e.g. "29")
  rchrg: "Y" | "N";   // Reverse Charge
  inv_typ: "R" | "DE" | "SEWOP" | "SEWP"; // Invoice Type
  customer_name?: string;
  customer_gstin?: string; // If registered
  items: Gstr1InvoiceLine[];
}

export interface Gstr1DocGroup {
  doc_num: number;
  from: string;
  to: string;
  totnum: number;
  cancel: number;
  net_issue: number;
}

export interface Gstr1Input {
  gstin: string;      // Merchant GSTIN
  fp: string;         // Filing Period (MMYYYY)
  gt: number;         // Gross turnover of previous financial year
  cur_gt: number;     // Gross turnover of current financial year
  invoices: Gstr1Invoice[];
  cdns?: any[];       // Credit / Debit notes
  nil?: any;          // Nil rated
  advances?: any[];   // Advances
  adjustments?: any[]; // Adjustments
}

// GSTIN Regex Format (e.g. 29DBAPB4400H1Z7)
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const FP_REGEX = /^(0[1-9]|1[0-2])[0-9]{4}$/; // MMYYYY
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

export function generateGstr1(input: Gstr1Input): { success: boolean; json?: any; errors?: string[] } {
  const errors: string[] = [];

  // --- 1. Global Validations ---
  if (!input.gstin) {
    errors.push("Merchant GSTIN is required.");
  } else if (!GSTIN_REGEX.test(input.gstin)) {
    errors.push(`Merchant GSTIN "${input.gstin}" is invalid (must match 15-character GSTN format).`);
  }

  if (!input.fp) {
    errors.push("Filing period (fp) is required.");
  } else if (!FP_REGEX.test(input.fp)) {
    errors.push(`Filing period "${input.fp}" is invalid (must be MMYYYY format, e.g. "062026").`);
  }

  const invoices = input.invoices || [];

  // --- 2. Row/Invoice level Validations ---
  invoices.forEach((inv, index) => {
    const ref = `Invoice #${inv.inum || index + 1}`;

    if (!inv.inum) {
      errors.push(`Row ${index + 1}: Invoice Number is required.`);
    }
    if (!inv.idt) {
      errors.push(`${ref}: Invoice Date is required.`);
    } else if (!DATE_REGEX.test(inv.idt)) {
      errors.push(`${ref}: Invoice Date "${inv.idt}" is invalid (must be YYYY-MM-DD format).`);
    }

    if (!inv.pos) {
      errors.push(`${ref}: Place of supply (pos) state code is required.`);
    } else if (inv.pos.length !== 2 || isNaN(Number(inv.pos))) {
      errors.push(`${ref}: Place of supply state code "${inv.pos}" is invalid (must be a 2-digit number).`);
    }

    if (inv.val === undefined || inv.val < 0) {
      errors.push(`${ref}: Grand total invoice value (val) is invalid.`);
    }

    // Customer GSTIN validation if B2B
    if (inv.customer_gstin) {
      if (!GSTIN_REGEX.test(inv.customer_gstin)) {
        errors.push(`${ref}: Customer GSTIN "${inv.customer_gstin}" is invalid.`);
      }
      // First 2 digits of customer GSTIN must match place of supply (pos)
      if (inv.customer_gstin.substring(0, 2) !== inv.pos) {
        errors.push(`${ref}: Customer GSTIN prefix "${inv.customer_gstin.substring(0, 2)}" does not match Place of Supply state code "${inv.pos}".`);
      }
    }

    if (!inv.items || inv.items.length === 0) {
      errors.push(`${ref}: Invoice must contain at least one line item.`);
    } else {
      inv.items.forEach((item, itemIdx) => {
        const itemRef = `${ref} [Item ${itemIdx + 1}]`;
        if (!item.hsn_sc) {
          errors.push(`${itemRef}: HSN/SAC code is required.`);
        } else if (item.hsn_sc.length < 2 || isNaN(Number(item.hsn_sc))) {
          errors.push(`${itemRef}: HSN/SAC code "${item.hsn_sc}" must be numeric.`);
        }
        if (item.txval === undefined || item.txval < 0) {
          errors.push(`${itemRef}: Taxable value (txval) is invalid.`);
        }
        if (item.qty === undefined || item.qty <= 0) {
          errors.push(`${itemRef}: Quantity (qty) must be positive.`);
        }
      });
    }
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // --- 3. Construct GSTN-compatible JSON ---
  const b2b: any[] = [];
  const b2cl: any[] = [];
  const b2cs: any[] = [];
  const hsnData: any[] = [];

  // Group B2B by customer GSTIN
  const b2bGroups: { [gstin: string]: any } = {};
  // Group B2CL by Place of Supply (pos)
  const b2clGroups: { [pos: string]: any } = {};
  // Group B2CS by Place of Supply (pos) and GST rate
  const b2csGroups: { [key: string]: any } = {};

  invoices.forEach(inv => {
    // Format Date: DD-MM-YYYY
    const [year, month, day] = inv.idt.split("-");
    const formattedDate = `${day}-${month}-${year}`;

    // Determine supply type (intra or inter)
    const isInter = inv.pos !== input.gstin.substring(0, 2);
    const supplyType = isInter ? "INTER" : "INTRA";

    if (inv.customer_gstin) {
      // -----------------------------------------------------
      // B2B Section
      // -----------------------------------------------------
      const ctin = inv.customer_gstin;
      if (!b2bGroups[ctin]) {
        b2bGroups[ctin] = { ctin, inv: [] };
      }

      // Group items by rate percentage
      const rateGroups: { [rt: number]: any } = {};
      inv.items.forEach(item => {
        const rt = item.rt;
        if (!rateGroups[rt]) {
          rateGroups[rt] = { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
        }
        rateGroups[rt].txval += item.txval;
        rateGroups[rt].iamt += item.iamt || 0;
        rateGroups[rt].camt += item.camt || 0;
        rateGroups[rt].samt += item.samt || 0;
        rateGroups[rt].csamt += item.csamt || 0;
      });

      const itms = Object.keys(rateGroups).map((rtStr, idx) => {
        const rt = parseFloat(rtStr);
        const group = rateGroups[rt];
        return {
          num: idx + 1,
          itm_det: {
            txval: Math.round(group.txval * 100) / 100,
            rt,
            iamt: Math.round(group.iamt * 100) / 100,
            camt: Math.round(group.camt * 100) / 100,
            samt: Math.round(group.samt * 100) / 100,
            csamt: Math.round(group.csamt * 100) / 100
          }
        };
      });

      b2bGroups[ctin].inv.push({
        inum: inv.inum,
        idt: formattedDate,
        val: Math.round(inv.val * 100) / 100,
        pos: inv.pos,
        rchrg: inv.rchrg,
        inv_typ: inv.inv_typ,
        itms
      });
    } else {
      // B2C Supplies (No Customer GSTIN)
      // Standard rule: interstate supplies above 2.5 Lakhs are B2C Large (B2CL)
      if (isInter && inv.val > 250000) {
        // -----------------------------------------------------
        // B2CL Section
        // -----------------------------------------------------
        const pos = inv.pos;
        if (!b2clGroups[pos]) {
          b2clGroups[pos] = { pos, inv: [] };
        }

        // Group items by rate
        const rateGroups: { [rt: number]: any } = {};
        inv.items.forEach(item => {
          const rt = item.rt;
          if (!rateGroups[rt]) {
            rateGroups[rt] = { txval: 0, iamt: 0, csamt: 0 };
          }
          rateGroups[rt].txval += item.txval;
          rateGroups[rt].iamt += item.iamt || 0;
          rateGroups[rt].csamt += item.csamt || 0;
        });

        const itms = Object.keys(rateGroups).map((rtStr, idx) => {
          const rt = parseFloat(rtStr);
          const group = rateGroups[rt];
          return {
            num: idx + 1,
            itm_det: {
              txval: Math.round(group.txval * 100) / 100,
              rt,
              iamt: Math.round(group.iamt * 100) / 100,
              csamt: Math.round(group.csamt * 100) / 100
            }
          };
        });

        b2clGroups[pos].inv.push({
          inum: inv.inum,
          idt: formattedDate,
          val: Math.round(inv.val * 100) / 100,
          itms
        });
      } else {
        // -----------------------------------------------------
        // B2CS Section (Grouped by POS + Rate + SupplyType)
        // -----------------------------------------------------
        inv.items.forEach(item => {
          const key = `${inv.pos}_${item.rt}_${supplyType}`;
          if (!b2csGroups[key]) {
            b2csGroups[key] = {
              pos: inv.pos,
              typ: "OE", // Other than E-commerce
              txval: 0,
              iamt: 0,
              camt: 0,
              samt: 0,
              csamt: 0,
              rt: item.rt,
              sply_ty: supplyType
            };
          }
          b2csGroups[key].txval += item.txval;
          b2csGroups[key].iamt += item.iamt || 0;
          b2csGroups[key].camt += item.camt || 0;
          b2csGroups[key].samt += item.samt || 0;
          b2csGroups[key].csamt += item.csamt || 0;
        });
      }
    }

    // -----------------------------------------------------
    // HSN Outward Summary Aggregation
    // -----------------------------------------------------
    inv.items.forEach(item => {
      // Find existing HSN summary entry
      let hsnEntry = hsnData.find(h => h.hsn_sc === item.hsn_sc && h.rt === item.rt);
      if (!hsnEntry) {
        hsnEntry = {
          hsn_sc: item.hsn_sc,
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
          desc: item.description,
          user_desc: item.description,
          uqc: item.uqc || "PCS",
          qty: 0,
          rt: item.rt,
          num: hsnData.length + 1
        };
        hsnData.push(hsnEntry);
      }
      hsnEntry.txval += item.txval;
      hsnEntry.qty += item.qty;
      hsnEntry.iamt += item.iamt || 0;
      hsnEntry.camt += item.camt || 0;
      hsnEntry.samt += item.samt || 0;
      hsnEntry.csamt += item.csamt || 0;
    });
  });

  // Convert groups to arrays
  Object.keys(b2bGroups).forEach(k => b2b.push(b2bGroups[k]));
  Object.keys(b2clGroups).forEach(k => b2cl.push(b2clGroups[k]));
  Object.keys(b2csGroups).forEach(k => {
    const group = b2csGroups[k];
    group.txval = Math.round(group.txval * 100) / 100;
    group.iamt = Math.round(group.iamt * 100) / 100;
    group.camt = Math.round(group.camt * 100) / 100;
    group.samt = Math.round(group.samt * 100) / 100;
    group.csamt = Math.round(group.csamt * 100) / 100;
    b2cs.push(group);
  });

  // Round HSN aggregates
  hsnData.forEach(h => {
    h.txval = Math.round(h.txval * 100) / 100;
    h.qty = Math.round(h.qty * 100) / 100;
    h.iamt = Math.round(h.iamt * 100) / 100;
    h.camt = Math.round(h.camt * 100) / 100;
    h.samt = Math.round(h.samt * 100) / 100;
    h.csamt = Math.round(h.csamt * 100) / 100;
  });

  // -----------------------------------------------------
  // Doc Issued Aggregation
  // -----------------------------------------------------
  const doc_issue: any = { doc_det: [] };
  if (invoices.length > 0) {
    // Sort invoices to find sequence boundaries
    const sorted = [...invoices].sort((a, b) => a.inum.localeCompare(b.inum));
    const firstNum = sorted[0].inum;
    const lastNum = sorted[sorted.length - 1].inum;
    let cancelCount = 0;
    
    const firstMatch = firstNum.match(/(\d+)$/);
    const lastMatch = lastNum.match(/(\d+)$/);
    if (firstMatch && lastMatch) {
      const startSeq = parseInt(firstMatch[1], 10);
      const endSeq = parseInt(lastMatch[1], 10);
      const totalSpan = endSeq - startSeq + 1;
      if (totalSpan >= invoices.length) {
        cancelCount = totalSpan - invoices.length;
      }
    }

    doc_issue.doc_det.push({
      doc_num: 1, // Outward supply invoices
      docs: [
        {
          num: 1,
          from: firstNum,
          to: lastNum,
          totnum: invoices.length + cancelCount,
          cancel: cancelCount,
          net_issue: invoices.length
        }
      ]
    });
  }

  // --- Final GSTN JSON Object Assembly ---
  const resultJson: any = {
    gstin: input.gstin,
    fp: input.fp,
    gt: input.gt || 0,
    cur_gt: input.cur_gt || 0,
    version: "GST3.0.4" // Official GSTN offline utility schema version
  };

  if (b2b.length > 0) resultJson.b2b = b2b;
  if (b2cl.length > 0) resultJson.b2cl = b2cl;
  if (b2cs.length > 0) resultJson.b2cs = b2cs;
  
  if (hsnData.length > 0) {
    resultJson.hsn = {
      data: hsnData,
      hsn_b2c: hsnData // Include both formats for maximum portal compatibility
    };
  }

  if (doc_issue.doc_det.length > 0) {
    resultJson.doc_issue = doc_issue;
  }

  // Inject user's other optional sections if passed in input
  if (input.cdns && input.cdns.length > 0) {
    resultJson.cdnr = input.cdns.filter(c => c.customer_gstin); // Registered
    resultJson.cdnur = input.cdns.filter(c => !c.customer_gstin); // Unregistered
  }
  if (input.nil) {
    resultJson.nil = input.nil;
  }
  if (input.advances && input.advances.length > 0) {
    resultJson.at = input.advances;
  }
  if (input.adjustments && input.adjustments.length > 0) {
    resultJson.txpd = input.adjustments;
  }

  return {
    success: true,
    json: resultJson
  };
}
