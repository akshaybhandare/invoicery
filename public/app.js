document.addEventListener("DOMContentLoaded", () => {
  // Navigation & Core Elements
  const navItems = document.querySelectorAll(".nav-menu-link");
  const tabContents = document.querySelectorAll(".tab-content");
  const statusBadge = document.getElementById("status-badge");
  const statusText = document.getElementById("status-text");
  let activeSelectForQuickProductAdd = null;

  // Settings values elements
  const setBizName = document.getElementById("set-biz-name");
  const setBizGst = document.getElementById("set-biz-gst");
  const setBizState = document.getElementById("set-biz-state");
  const setBizStateCode = document.getElementById("set-biz-state-code");

  // --- 1. SPA Tab Routing ---
  function switchTab(tabId) {
    navItems.forEach(item => item.classList.remove("active"));
    tabContents.forEach(tab => tab.classList.remove("active"));

    const targetLink = document.querySelector(`.nav-menu-link[data-tab="${tabId}"]`);
    const targetTab = document.getElementById(`tab-${tabId}`);

    if (targetLink && targetTab) {
      targetLink.classList.add("active");
      targetTab.classList.add("active");
    }

    // Trigger tab-specific fetches
    if (tabId === "dashboard") {
      fetchDashboardMetrics();
    } else if (tabId === "customers") {
      fetchCustomers();
    } else if (tabId === "products") {
      fetchProducts();
    } else if (tabId === "invoices") {
      fetchInvoices();
    } else if (tabId === "purchases") {
      fetchPurchases();
    } else if (tabId === "expenses") {
      fetchExpenses();
    } else if (tabId === "reports") {
      fetchGstReport();
      fetchPaymentsLedger();
      fetchFilingRegisters();
    }
  }

  // Handle click on nav items
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = item.getAttribute("data-tab");
      window.location.hash = tabId;
    });
  });

  // Attach click listener for any quick CTA links in hero cards
  const heroBtnSelector = ".hero-action-pair .btn, .hero-action-buttons .btn, .hero-actions .hero-cta-link";
  document.querySelectorAll(heroBtnSelector).forEach(link => {
    link.addEventListener("click", (e) => {
      const tabId = link.getAttribute("data-tab");
      if (tabId) {
        e.preventDefault();
        window.location.hash = tabId;
      }
    });
  });

  // Handle URL hash changes
  function handleHashRoute() {
    const hash = window.location.hash.substring(1) || "dashboard";
    switchTab(hash);
  }  

  // --- 1B. Generic Sorting, Filtering & Row Count Table Controller ---
  function initializeTableControls(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const table = tbody.closest("table");
    if (!table) return;

    // Reset originalRows cache on new fetch loads
    tbody.originalRows = Array.from(tbody.querySelectorAll("tr"));

    // Find or create .table-controls parent block
    let controlsDiv = table.parentNode.querySelector(`.table-controls[data-target="${tbodyId}"]`);
    if (!controlsDiv) {
      controlsDiv = document.createElement("div");
      controlsDiv.className = "table-controls";
      controlsDiv.dataset.target = tbodyId;
      controlsDiv.style.cssText = "display: flex; gap: 12px; margin-bottom: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap;";
      controlsDiv.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" class="form-input table-filter-input" placeholder="🔍 Search this table..." style="width: 220px; margin: 0; padding: 6px 12px; height: 32px; border-radius: 6px; font-size: 11px;">
          <button class="btn btn-secondary-pill table-reset-btn" style="padding: 4px 12px; height: 32px; font-size: 11px;">Reset</button>
        </div>
        <div style="font-size: 11px; color: #555;">
          Showing <span class="table-row-count">0</span> records
        </div>
      `;
      table.parentNode.insertBefore(controlsDiv, table);
    }

    const filterInput = controlsDiv.querySelector(".table-filter-input");
    const resetBtn = controlsDiv.querySelector(".table-reset-btn");
    const countSpan = controlsDiv.querySelector(".table-row-count");

    // Reset input on new render loads
    filterInput.value = "";

    const updateCount = () => {
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const visibleRows = rows.filter(r => r.style.display !== "none" && !(r.cells.length === 1 && r.cells[0].colSpan > 1));
      if (countSpan) countSpan.textContent = visibleRows.length;
    };

    filterInput.oninput = () => {
      const val = filterInput.value.toLowerCase().trim();
      const rows = tbody.querySelectorAll("tr");
      rows.forEach(row => {
        if (row.cells.length === 1 && row.cells[0].colSpan > 1) return; // skip empty text rows
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(val) ? "" : "none";
      });
      updateCount();
    };

    resetBtn.onclick = () => {
      filterInput.value = "";
      const rows = tbody.querySelectorAll("tr");
      rows.forEach(row => row.style.display = "");
      
      const headers = table.querySelectorAll("thead th");
      headers.forEach(th => {
        th.dataset.order = "";
        const arrow = th.querySelector(".sort-arrow");
        if (arrow) arrow.textContent = " ↕";
      });

      if (tbody.originalRows) {
        tbody.innerHTML = "";
        tbody.originalRows.forEach(r => tbody.appendChild(r));
      }
      updateCount();
    };

    const headers = table.querySelectorAll("thead th");
    headers.forEach((th, colIdx) => {
      if (th.textContent.includes("ACTION") || th.textContent.trim() === "") return;
      
      th.style.cursor = "pointer";
      th.style.userSelect = "none";
      
      let arrow = th.querySelector(".sort-arrow");
      if (!arrow) {
        arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.style.color = "#888";
        arrow.style.fontSize = "10px";
        arrow.style.marginLeft = "6px";
        arrow.textContent = " ↕";
        th.appendChild(arrow);
      }

      th.onclick = () => {
        const rows = Array.from(tbody.querySelectorAll("tr")).filter(row => {
          return !(row.cells.length === 1 && row.cells[0].colSpan > 1);
        });

        const currentOrder = th.dataset.order || "none";
        let nextOrder = "asc";
        if (currentOrder === "asc") nextOrder = "desc";
        else if (currentOrder === "desc") nextOrder = "none";

        headers.forEach(h => {
          h.dataset.order = "";
          const a = h.querySelector(".sort-arrow");
          if (a) a.textContent = " ↕";
        });

        if (nextOrder === "none") {
          tbody.innerHTML = "";
          tbody.originalRows.forEach(r => {
            r.style.display = "";
            tbody.appendChild(r);
          });
          filterInput.value = "";
          updateCount();
          return;
        }

        th.dataset.order = nextOrder;
        arrow.textContent = nextOrder === "asc" ? " ▲" : " ▼";

        rows.sort((rowA, rowB) => {
          const valA = rowA.cells[colIdx] ? rowA.cells[colIdx].textContent.trim() : "";
          const valB = rowB.cells[colIdx] ? rowB.cells[colIdx].textContent.trim() : "";

          const cleanVal = (v) => {
            const cleaned = v.replace(/[₹,%\s]/g, "");
            return isNaN(cleaned) || cleaned === "" ? v.toLowerCase() : parseFloat(cleaned);
          };

          const cleanA = cleanVal(valA);
          const cleanB = cleanVal(valB);

          if (typeof cleanA === "number" && typeof cleanB === "number") {
            return nextOrder === "asc" ? cleanA - cleanB : cleanB - cleanA;
          }
          return nextOrder === "asc"
            ? String(cleanA).localeCompare(String(cleanB))
            : String(cleanB).localeCompare(String(cleanA));
        });

        tbody.innerHTML = "";
        rows.forEach(r => tbody.appendChild(r));
        filterInput.dispatchEvent(new Event("input"));
      };
    });

    updateCount();
  }

  // --- 2. Keyboard Shortcuts (Ctrl + F) ---
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      globalSearchInput.focus();
    }
    if (e.key === "Escape") {
      globalSearchInput.blur();
      // Also close active modals
      closeModal("customer-modal");
      closeModal("product-modal");
    }
  });

  // --- 3. Backend Verification Ping ---
  async function checkServerStatus() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error("HTTP connection failed");
      const data = await response.json();
      if (data.status === "OK") {
        statusBadge.className = "status-badge connected";
        statusText.textContent = "ONLINE";
        if (data.settings) {
          setBizName.value = data.settings.business_name || "";
          setBizGst.value = data.settings.business_gstin || "";
          setBizState.value = data.settings.business_state || "";
          setBizStateCode.value = data.settings.business_state_code || "";
          
          const setBizAddress = document.getElementById("set-biz-address");
          if (setBizAddress) setBizAddress.value = data.settings.business_address || "";

          const logoPath = data.settings.business_logo_path || "";
          const setBizLogoPath = document.getElementById("set-biz-logo-path");
          if (setBizLogoPath) setBizLogoPath.value = logoPath;
          updateLogoPreviewUI(logoPath);

          const apiEnabled = data.settings.api_enabled === "true";
          const setApiEnabled = document.getElementById("set-api-enabled");
          const setApiKey = document.getElementById("set-api-key");
          const apiKeySection = document.getElementById("api-key-section");
          if (setApiEnabled) {
            setApiEnabled.checked = apiEnabled;
            if (apiKeySection) apiKeySection.style.display = apiEnabled ? "block" : "none";
          }
          if (setApiKey) setApiKey.value = data.settings.api_key || "";
        }
      } else {
        throw new Error(data.message || "Unknown error");
      }
    } catch (error) {
      console.error("Server health check failed:", error);
      statusBadge.className = "status-badge disconnected";
      statusText.textContent = "OFFLINE";
    }
  }
  checkServerStatus();

  // --- 4. Modal Helpers ---
  function openModal(modalId) {
    document.getElementById(modalId).classList.add("active");
  }

  function closeModal(modalId) {
    document.getElementById(modalId).classList.remove("active");
    // Clear any form error messages
    const errorDiv = document.getElementById(`${modalId}-error`);
    if (errorDiv) {
      errorDiv.style.display = "none";
      errorDiv.textContent = "";
    }
  }

  // --- 5. Customers Module Client Logic ---
  const custModal = document.getElementById("customer-modal");
  const custForm = document.getElementById("customer-form");
  const custModalTitle = document.getElementById("customer-modal-title");
  const btnAddCustomer = document.getElementById("btn-add-customer");
  const btnCancelCustomer = document.getElementById("btn-cancel-customer");
  const customerSearch = document.getElementById("customer-search");
  
  let isEditingCustomer = false;
  let editingCustomerId = "";

  // Set up dynamic error alert box in customer modal
  const custErrorAlert = document.createElement("div");
  custErrorAlert.id = "customer-modal-error";
  custErrorAlert.style.display = "none";
  custErrorAlert.style.color = "var(--color-ember)";
  custErrorAlert.style.marginBottom = "16px";
  custErrorAlert.style.fontSize = "13px";
  custErrorAlert.style.fontWeight = "bold";
  custForm.insertBefore(custErrorAlert, custForm.firstChild);

  // Dynamic state code extraction based on State selection
  const custStateSelect = document.getElementById("cust-state");
  const custStateCodeInput = document.getElementById("cust-state-code");
  
  // Billing and Shipping address mapping elements
  const custBillingAddress = document.getElementById("cust-billing-address");
  const custShippingAddress = document.getElementById("cust-shipping-address");
  const custSameAddress = document.getElementById("cust-same-address");

  custSameAddress.addEventListener("change", () => {
    if (custSameAddress.checked) {
      custShippingAddress.value = custBillingAddress.value;
      custShippingAddress.readOnly = true;
    } else {
      custShippingAddress.readOnly = false;
    }
  });

  custBillingAddress.addEventListener("input", () => {
    if (custSameAddress.checked) {
      custShippingAddress.value = custBillingAddress.value;
    }
  });

  custStateSelect.addEventListener("change", () => {
    const selectedOption = custStateSelect.options[custStateSelect.selectedIndex];
    custStateCodeInput.value = selectedOption.getAttribute("data-code") || "";
  });

  // Auto-detect State and State Code from GSTIN input
  const custGstinInput = document.getElementById("cust-gstin");
  custGstinInput.addEventListener("input", () => {
    const val = custGstinInput.value.trim();
    if (val.length >= 2) {
      const parsedStateCode = val.substring(0, 2);
      // Try to find matching option in state select
      for (let i = 0; i < custStateSelect.options.length; i++) {
        const opt = custStateSelect.options[i];
        if (opt.getAttribute("data-code") === parsedStateCode) {
          custStateSelect.selectedIndex = i;
          custStateCodeInput.value = parsedStateCode;
          break;
        }
      }
    }
  });

  // Fetch and display customers list safely (XSS Prevention)
  async function fetchCustomers(searchVal = "") {
    try {
      const url = searchVal 
        ? `/api/customers/search?q=${encodeURIComponent(searchVal)}`
        : "/api/customers";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load customers catalog");
      
      const list = await res.json();
      const listContainer = document.getElementById("customers-list");
      const emptyMsg = document.getElementById("customers-empty");
      
      listContainer.innerHTML = ""; // Clear existing rows securely

      if (list.length === 0) {
        emptyMsg.style.display = "block";
      } else {
        emptyMsg.style.display = "none";
        list.forEach(cust => {
          const row = document.createElement("tr");

          const tdId = document.createElement("td");
          tdId.textContent = cust.id;
          row.appendChild(tdId);

          const tdName = document.createElement("td");
          tdName.textContent = cust.name;
          row.appendChild(tdName);

          const tdGstin = document.createElement("td");
          tdGstin.textContent = cust.gstin || "—";
          row.appendChild(tdGstin);

          const tdPhone = document.createElement("td");
          tdPhone.textContent = cust.phone || "—";
          row.appendChild(tdPhone);

          const tdState = document.createElement("td");
          tdState.textContent = `${cust.state} (${cust.state_code})`;
          row.appendChild(tdState);

          const tdBalance = document.createElement("td");
          const balance = parseFloat(cust.outstanding_balance || 0);
          tdBalance.textContent = `₹${balance.toFixed(2)}`;
          if (balance > 0) {
            tdBalance.style.color = "var(--color-ember)";
            tdBalance.style.fontWeight = "bold";
          } else {
            tdBalance.style.color = "green";
            tdBalance.style.fontWeight = "bold";
          }
          row.appendChild(tdBalance);

          // Action column
          const tdActions = document.createElement("td");
          
          const btnEdit = document.createElement("button");
          btnEdit.className = "btn-small edit";
          btnEdit.textContent = "EDIT";
          btnEdit.addEventListener("click", () => startEditCustomer(cust));
          tdActions.appendChild(btnEdit);

          const btnDelete = document.createElement("button");
          btnDelete.className = "btn-small delete";
          btnDelete.textContent = "DELETE";
          btnDelete.addEventListener("click", () => handleDeleteCustomer(cust.id));
          tdActions.appendChild(btnDelete);

          row.appendChild(tdActions);
          listContainer.appendChild(row);
        });
        initializeTableControls("customers-list");
      }
    } catch (err) {
      console.error("Error loading customers:", err);
    }
  }

  // Trigger search on typing in Customer Search Field
  customerSearch.addEventListener("input", (e) => {
    fetchCustomers(e.target.value.trim());
  });

  btnAddCustomer.addEventListener("click", async () => {
    isEditingCustomer = false;
    custModalTitle.textContent = "ADD CUSTOMER";
    custForm.reset();
    document.getElementById("cust-id").readOnly = false;
    custStateSelect.selectedIndex = 0;
    custStateCodeInput.value = "29"; // Karnataka default
    custSameAddress.checked = false;
    custShippingAddress.readOnly = false;

    try {
      const res = await fetch("/api/customers/next-id");
      if (res.ok) {
        const data = await res.json();
        document.getElementById("cust-id").value = data.nextId || "";
      }
    } catch (err) {
      console.error("Error fetching next customer ID:", err);
    }

    openModal("customer-modal");
  });

  btnCancelCustomer.addEventListener("click", () => {
    closeModal("customer-modal");
  });

  function startEditCustomer(cust) {
    isEditingCustomer = true;
    editingCustomerId = cust.id;
    custModalTitle.textContent = "EDIT CUSTOMER";
    
    document.getElementById("cust-id").value = cust.id;
    document.getElementById("cust-id").readOnly = true; // Cannot edit primary key ID
    document.getElementById("cust-name").value = cust.name;
    document.getElementById("cust-gstin").value = cust.gstin || "";
    document.getElementById("cust-pan").value = cust.pan || "";
    document.getElementById("cust-phone").value = cust.phone || "";
    document.getElementById("cust-email").value = cust.email || "";
    document.getElementById("cust-billing-address").value = cust.billing_address || "";
    document.getElementById("cust-shipping-address").value = cust.shipping_address || "";
    document.getElementById("cust-contact").value = cust.contact || "";
    document.getElementById("cust-notes").value = cust.notes || "";

    // Sync shipping same as billing checkbox
    const hasBilling = cust.billing_address && cust.billing_address.trim() !== "";
    custSameAddress.checked = hasBilling && (cust.billing_address === cust.shipping_address);
    custShippingAddress.readOnly = custSameAddress.checked;

    // Set matching state selection
    for (let i = 0; i < custStateSelect.options.length; i++) {
      if (custStateSelect.options[i].value === cust.state) {
        custStateSelect.selectedIndex = i;
        break;
      }
    }
    custStateCodeInput.value = cust.state_code;

    openModal("customer-modal");
  }

  // Submit form payload securely
  custForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    custErrorAlert.style.display = "none";
    custErrorAlert.textContent = "";

    const customerPayload = {
      id: document.getElementById("cust-id").value.trim(),
      name: document.getElementById("cust-name").value.trim(),
      gstin: document.getElementById("cust-gstin").value.trim(),
      pan: document.getElementById("cust-pan").value.trim(),
      phone: document.getElementById("cust-phone").value.trim(),
      email: document.getElementById("cust-email").value.trim(),
      state: custStateSelect.value,
      state_code: custStateCodeInput.value,
      billing_address: document.getElementById("cust-billing-address").value.trim(),
      shipping_address: document.getElementById("cust-shipping-address").value.trim(),
      contact_person: document.getElementById("cust-contact").value.trim(),
      notes: document.getElementById("cust-notes").value.trim()
    };

    try {
      const method = isEditingCustomer ? "PUT" : "POST";
      const url = isEditingCustomer ? `/api/customers?id=${editingCustomerId}` : "/api/customers";
      
      const response = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerPayload)
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save customer");
      }

      closeModal("customer-modal");
      fetchCustomers(); // Reload list
    } catch (err) {
      custErrorAlert.style.display = "block";
      custErrorAlert.textContent = err.message;
    }
  });

  async function handleDeleteCustomer(id) {
    // Non-blocking confirmation modal simulation using standard web prompt is disabled.
    // We will confirm by showing a non-blocking confirmation.
    if (!confirm(`Are you sure you want to delete customer ${id}?`)) return;

    try {
      const response = await fetch(`/api/customers?id=${id}`, {
        method: "DELETE"
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete customer");
      }
      fetchCustomers();
    } catch (err) {
      alert(`Error: ${err.message}`); // TODO(security): Replace with UI banner in Story 5
    }
  }

  // --- 6. Products Module Client Logic ---
  const prodModal = document.getElementById("product-modal");
  const prodForm = document.getElementById("product-form");
  const prodModalTitle = document.getElementById("product-modal-title");
  const btnAddProduct = document.getElementById("btn-add-product");
  const btnCancelProduct = document.getElementById("btn-cancel-product");
  const productSearch = document.getElementById("product-search");
  const prodGstSelect = document.getElementById("prod-gst-rate");

  let isEditingProduct = false;
  let editingProductSku = "";

  // Set up dynamic error alert box in product modal
  const prodErrorAlert = document.createElement("div");
  prodErrorAlert.id = "product-modal-error";
  prodErrorAlert.style.display = "none";
  prodErrorAlert.style.color = "var(--color-ember)";
  prodErrorAlert.style.marginBottom = "16px";
  prodErrorAlert.style.fontSize = "13px";
  prodErrorAlert.style.fontWeight = "bold";
  prodForm.insertBefore(prodErrorAlert, prodForm.firstChild);

  // Load GST rates to populate form select dropdown
  async function loadGstRates() {
    try {
      const res = await fetch("/api/gst-rates");
      if (!res.ok) throw new Error("Failed to load GST rate bands");
      const rates = await res.json();
      
      prodGstSelect.innerHTML = "";
      rates.forEach(rate => {
        const opt = document.createElement("option");
        opt.value = rate.id;
        opt.textContent = `${rate.rate}% — ${rate.description}`;
        prodGstSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Error loading GST rates:", err);
    }
  }
  loadGstRates();

  // Fetch and display products list safely (XSS Prevention)
  async function fetchProducts(searchVal = "") {
    try {
      const url = searchVal 
        ? `/api/products/search?q=${encodeURIComponent(searchVal)}`
        : "/api/products";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load products");
      const list = await res.json();
      
      const listContainer = document.getElementById("products-list");
      const emptyMsg = document.getElementById("products-empty");

      listContainer.innerHTML = "";

      if (list.length === 0) {
        emptyMsg.style.display = "block";
      } else {
        emptyMsg.style.display = "none";
        list.forEach(p => {
          const row = document.createElement("tr");

          const tdSku = document.createElement("td");
          tdSku.textContent = p.id; // SKU
          row.appendChild(tdSku);

          const tdName = document.createElement("td");
          tdName.textContent = p.name;
          row.appendChild(tdName);

          const tdHsn = document.createElement("td");
          tdHsn.textContent = p.hsn_sac_code || "—";
          row.appendChild(tdHsn);

          const tdRate = document.createElement("td");
          tdRate.textContent = `${p.gst_rate}%`;
          row.appendChild(tdRate);

          const tdPrice = document.createElement("td");
          tdPrice.textContent = `₹${parseFloat(p.selling_price).toFixed(2)}`;
          row.appendChild(tdPrice);

          const tdStock = document.createElement("td");
          tdStock.textContent = `${p.current_stock} ${p.unit}`;
          row.appendChild(tdStock);

          // Actions
          const tdActions = document.createElement("td");

          const btnEdit = document.createElement("button");
          btnEdit.className = "btn-small edit";
          btnEdit.textContent = "EDIT";
          btnEdit.addEventListener("click", () => startEditProduct(p));
          tdActions.appendChild(btnEdit);

          const btnDelete = document.createElement("button");
          btnDelete.className = "btn-small delete";
          btnDelete.textContent = "ARCHIVE";
          btnDelete.addEventListener("click", () => handleArchiveProduct(p.id));
          tdActions.appendChild(btnDelete);

          row.appendChild(tdActions);
          listContainer.appendChild(row);
        });
        initializeTableControls("products-list");
      }
    } catch (err) {
      console.error("Error loading products:", err);
    }
  }

  productSearch.addEventListener("input", (e) => {
    fetchProducts(e.target.value.trim());
  });

  btnAddProduct.addEventListener("click", () => {
    isEditingProduct = false;
    prodModalTitle.textContent = "ADD PRODUCT";
    prodForm.reset();
    document.getElementById("prod-id").readOnly = false;
    
    // Enable stock field and hide adjust button on create
    const stockInput = document.getElementById("prod-stock");
    stockInput.disabled = false;
    stockInput.readOnly = false;
    const adjustBtn = document.getElementById("btn-adjust-stock");
    if (adjustBtn) adjustBtn.style.display = "none";
    const stockHelp = document.getElementById("prod-stock-help");
    if (stockHelp) stockHelp.textContent = "Set the initial opening stock of the product.";
    
    openModal("product-modal");
  });

  btnCancelProduct.addEventListener("click", () => {
    closeModal("product-modal");
  });

  function startEditProduct(p) {
    isEditingProduct = true;
    editingProductSku = p.id;
    prodModalTitle.textContent = "EDIT PRODUCT";

    document.getElementById("prod-id").value = p.id;
    document.getElementById("prod-id").readOnly = true; // Primary SKU code locked
    document.getElementById("prod-name").value = p.name;
    document.getElementById("prod-hsn").value = p.hsn_sac_code || "";
    document.getElementById("prod-unit").value = p.unit || "PCS";
    document.getElementById("prod-purchase-price").value = p.purchase_price;
    document.getElementById("prod-selling-price").value = p.selling_price;
    
    // Disable stock field and show adjust button on edit
    const stockInput = document.getElementById("prod-stock");
    stockInput.value = p.current_stock;
    stockInput.disabled = true;
    const adjustBtn = document.getElementById("btn-adjust-stock");
    if (adjustBtn) adjustBtn.style.display = "inline-block";
    const stockHelp = document.getElementById("prod-stock-help");
    if (stockHelp) stockHelp.textContent = "Stock is read-only. Modifies dynamically via Sales / Purchases. Click 'Adjust' to correct.";

    document.getElementById("prod-reorder").value = p.reorder_level;
    document.getElementById("prod-desc").value = p.description || "";

    // Set GST rate selection
    prodGstSelect.value = p.gst_rate_id;

    openModal("product-modal");
  }

  prodForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    prodErrorAlert.style.display = "none";
    prodErrorAlert.textContent = "";

    const productPayload = {
      id: document.getElementById("prod-id").value.trim(),
      sku: document.getElementById("prod-id").value.trim(),
      name: document.getElementById("prod-name").value.trim(),
      description: document.getElementById("prod-desc").value.trim(),
      hsn_sac_code: document.getElementById("prod-hsn").value.trim(),
      gst_rate_id: parseInt(prodGstSelect.value),
      unit: document.getElementById("prod-unit").value.trim(),
      purchase_price: parseFloat(document.getElementById("prod-purchase-price").value),
      selling_price: parseFloat(document.getElementById("prod-selling-price").value),
      current_stock: parseFloat(document.getElementById("prod-stock").value),
      reorder_level: parseFloat(document.getElementById("prod-reorder").value)
    };

    try {
      const method = isEditingProduct ? "PUT" : "POST";
      const url = isEditingProduct ? `/api/products?id=${editingProductSku}` : "/api/products";

      const response = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productPayload)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save product details");
      }

      closeModal("product-modal");
      fetchProducts();

      // If triggered from a quick-add select in the purchase form
      if (activeSelectForQuickProductAdd) {
        const newProdId = productPayload.id;

        // Refresh products cache first so that cachedProducts has the new product
        const prodRes = await fetch("/api/products");
        if (prodRes.ok) {
          cachedProducts = await prodRes.json();
        }

        // Update all the select elements in the current purchase items grid to contain the new product
        const selects = purchaseItemsBody.querySelectorAll(".pur-prod-select");
        selects.forEach(sel => {
          const prevVal = sel.value;
          sel.innerHTML = '<option value="">-- SELECT PRODUCT --</option>' + 
            '<option value="NEW_PRODUCT" style="font-weight: bold; color: #fc5000;">+ ADD NEW PRODUCT...</option>' +
            cachedProducts.map(p => `<option value="${p.id}">${p.name} (SKU: ${p.sku})</option>`).join("");
          if (prevVal === "NEW_PRODUCT") {
            sel.value = newProdId;
          } else {
            sel.value = prevVal;
          }
        });

        // Trigger change event to fill default prices
        activeSelectForQuickProductAdd.value = newProdId;
        activeSelectForQuickProductAdd.dispatchEvent(new Event("change"));

        activeSelectForQuickProductAdd = null;
      }
    } catch (err) {
      prodErrorAlert.style.display = "block";
      prodErrorAlert.textContent = err.message;
    }
  });

  async function handleArchiveProduct(sku) {
    if (!confirm(`Are you sure you want to archive product SKU ${sku}?`)) return;

    try {
      const response = await fetch(`/api/products?id=${sku}`, {
        method: "DELETE"
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to archive product");
      }
      fetchProducts();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // --- 7. Invoices Module Client Logic ---
  const btnCreateInvoice = document.getElementById("btn-create-invoice");
  const btnCancelInvoice = document.getElementById("btn-cancel-invoice");
  const btnAddInvoiceLine = document.getElementById("btn-add-invoice-line");
  const invoiceForm = document.getElementById("invoice-form");
  const invCustomerSelect = document.getElementById("inv-customer");
  const invSupplyStateSelect = document.getElementById("inv-supply-state");
  const invDateInput = document.getElementById("inv-date");
  const invoiceEditorItemsList = document.getElementById("invoice-editor-items-list");

  // Print Modal elements
  const btnTriggerPrint = document.getElementById("btn-trigger-print");
  const btnClosePrint = document.getElementById("btn-close-print");

  let cachedCustomers = [];
  let cachedProducts = [];
  let cachedSettings = {};

  // Fetch and cache settings on server status check
  async function cacheSystemSettings() {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        cachedSettings = data.settings || {};
      }
    } catch (e) {
      console.error("Failed to cache settings:", e);
    }
  }
  cacheSystemSettings();

  // Load Invoices List
  async function fetchInvoices() {
    try {
      const res = await fetch("/api/invoices");
      if (!res.ok) throw new Error("Failed to load invoices list");
      const list = await res.json();
      
      const tbody = document.getElementById("invoices-list");
      const emptyMsg = document.getElementById("invoices-empty");
      
      tbody.innerHTML = "";
      
      if (list.length === 0) {
        emptyMsg.style.display = "block";
      } else {
        emptyMsg.style.display = "none";
        list.forEach(inv => {
          const tr = document.createElement("tr");
          
          const tdNo = document.createElement("td");
          tdNo.textContent = inv.id;
          tr.appendChild(tdNo);
          
          const tdDate = document.createElement("td");
          tdDate.textContent = inv.invoice_date;
          tr.appendChild(tdDate);
          
          const tdCust = document.createElement("td");
          tdCust.textContent = inv.customer_name || "UNKNOWN CUSTOMER";
          tr.appendChild(tdCust);
          
          const tdPos = document.createElement("td");
          tdPos.textContent = inv.place_of_supply;
          tr.appendChild(tdPos);
          
          const tdTotal = document.createElement("td");
          tdTotal.textContent = `₹${parseFloat(inv.grand_total).toFixed(2)}`;
          tr.appendChild(tdTotal);

          const tdPaid = document.createElement("td");
          const paidVal = parseFloat(inv.paid_amount || 0);
          tdPaid.textContent = `₹${paidVal.toFixed(2)}`;
          tr.appendChild(tdPaid);

          const tdDue = document.createElement("td");
          const dueVal = parseFloat(inv.grand_total) - paidVal;
          tdDue.textContent = `₹${dueVal.toFixed(2)}`;
          if (dueVal > 0.01) {
            tdDue.style.color = "#fc5000";
            tdDue.style.fontWeight = "bold";
          } else {
            tdDue.style.color = "#10b981";
          }
          tr.appendChild(tdDue);
          
          const tdStatus = document.createElement("td");
          tdStatus.textContent = inv.status.toUpperCase();
          tr.appendChild(tdStatus);
          
          const tdActions = document.createElement("td");

          if (dueVal > 0.01) {
            const btnPay = document.createElement("button");
            btnPay.className = "btn-small edit";
            btnPay.style.backgroundColor = "#fc5000";
            btnPay.style.borderColor = "#fc5000";
            btnPay.style.color = "#ffffff";
            btnPay.style.marginRight = "6px";
            btnPay.textContent = "PAY";
            btnPay.addEventListener("click", () => openRecordPaymentModal(inv, dueVal));
            tdActions.appendChild(btnPay);
          }
          
          const btnPrint = document.createElement("button");
          btnPrint.className = "btn-small edit";
          btnPrint.textContent = "PRINT";
          btnPrint.addEventListener("click", () => openPrintInvoice(inv.id));
          tdActions.appendChild(btnPrint);
          
          const btnDel = document.createElement("button");
          btnDel.className = "btn-small delete";
          btnDel.textContent = "DELETE";
          btnDel.addEventListener("click", () => handleDeleteInvoice(inv.id));
          tdActions.appendChild(btnDel);
          
          tr.appendChild(tdActions);
          tbody.appendChild(tr);
        });
        initializeTableControls("invoices-list");
      }
    } catch (err) {
      console.error("Error fetching invoices:", err);
    }
  }

  // Hook tab loading is handled inside original switchTab definition

  // Pre-load data cache for customer/product dropdowns
  async function loadInvoiceDropdownCaches() {
    try {
      const custRes = await fetch("/api/customers");
      if (custRes.ok) cachedCustomers = await custRes.json();
      
      const prodRes = await fetch("/api/products");
      if (prodRes.ok) cachedProducts = await prodRes.json();
    } catch (e) {
      console.error("Failed to load invoice dropdown lists:", e);
    }
  }

  // Open invoice creation editor modal
  btnCreateInvoice.addEventListener("click", async () => {
    // Set loading indicator
    document.getElementById("inv-id-display").value = "INV-XXXXXX (GENERATING...)";
    invoiceEditorItemsList.innerHTML = "";
    
    // Set date default to today
    const today = new Date().toISOString().split("T")[0];
    invDateInput.value = today;

    // Reset notes
    document.getElementById("inv-notes").value = "";

    await loadInvoiceDropdownCaches();

    // Populate customers dropdown
    invCustomerSelect.innerHTML = '<option value="" disabled selected>CHOOSE CUSTOMER...</option>';
    cachedCustomers.forEach(cust => {
      const opt = document.createElement("option");
      opt.value = cust.id;
      opt.textContent = `${cust.name} (${cust.id})`;
      invCustomerSelect.appendChild(opt);
    });

    // Populate next invoice number
    try {
      const numRes = await fetch("/api/invoices/next-number");
      if (numRes.ok) {
        const data = await numRes.json();
        document.getElementById("inv-id-display").value = data.nextNumber;
      }
    } catch (e) {
      console.error(e);
      document.getElementById("inv-id-display").value = "INV-AUTO";
    }

    // Default place of supply to Karnataka
    invSupplyStateSelect.value = "Karnataka";

    // Add first item line row
    addInvoiceItemRow();
    recalculateInvoice();

    openModal("invoice-editor-modal");
  });

  btnCancelInvoice.addEventListener("click", () => {
    closeModal("invoice-editor-modal");
  });

  // Auto Place of Supply update on customer selection
  invCustomerSelect.addEventListener("change", () => {
    const custId = invCustomerSelect.value;
    const customer = cachedCustomers.find(c => c.id === custId);
    if (customer) {
      invSupplyStateSelect.value = customer.state;
      recalculateInvoice();
    }
  });

  invSupplyStateSelect.addEventListener("change", () => {
    recalculateInvoice();
  });

  // Add Item Row to Grid
  function addInvoiceItemRow() {
    const tr = document.createElement("tr");

    // Product selector dropdown
    const tdProd = document.createElement("td");
    const select = document.createElement("select");
    select.className = "form-select item-product-select";
    select.style.padding = "6px 12px";
    select.style.borderRadius = "var(--radius-small)";
    select.required = true;
    
    select.innerHTML = '<option value="" disabled selected>SELECT PRODUCT...</option>';
    cachedProducts.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    tdProd.appendChild(select);
    tr.appendChild(tdProd);

    // HSN Code display -> Editable Input field
    const tdHsn = document.createElement("td");
    tdHsn.className = "item-hsn-cell";
    const inputHsn = document.createElement("input");
    inputHsn.type = "text";
    inputHsn.className = "form-group item-hsn-input";
    inputHsn.style.padding = "6px 12px";
    inputHsn.style.borderRadius = "var(--radius-small)";
    inputHsn.style.border = "1.5px solid var(--color-obsidian)";
    inputHsn.style.width = "90px";
    inputHsn.value = "";
    tdHsn.appendChild(inputHsn);
    tr.appendChild(tdHsn);

    // Quantity Input
    const tdQty = document.createElement("td");
    const inputQty = document.createElement("input");
    inputQty.type = "number";
    inputQty.className = "form-group item-qty-input";
    inputQty.style.padding = "6px 12px";
    inputQty.style.borderRadius = "var(--radius-small)";
    inputQty.style.border = "1.5px solid var(--color-obsidian)";
    inputQty.min = "0.01";
    inputQty.step = "any";
    inputQty.value = "1";
    inputQty.required = true;
    tdQty.appendChild(inputQty);

    const stockWarning = document.createElement("span");
    stockWarning.className = "stock-warning-label";
    stockWarning.style.cssText = "display: block; font-size: 8px; color: #555; margin-top: 4px; line-height: 1.1;";
    stockWarning.textContent = "";
    tdQty.appendChild(stockWarning);

    tr.appendChild(tdQty);

    // Unit display
    const tdUnit = document.createElement("td");
    tdUnit.className = "item-unit-cell";
    tdUnit.textContent = "PCS";
    tr.appendChild(tdUnit);

    // Price Input
    const tdPrice = document.createElement("td");
    const inputPrice = document.createElement("input");
    inputPrice.type = "number";
    inputPrice.className = "form-group item-price-input";
    inputPrice.style.padding = "6px 12px";
    inputPrice.style.borderRadius = "var(--radius-small)";
    inputPrice.style.border = "1.5px solid var(--color-obsidian)";
    inputPrice.min = "0.00";
    inputPrice.step = "0.01";
    inputPrice.value = "0.00";
    inputPrice.required = true;
    tdPrice.appendChild(inputPrice);
    tr.appendChild(tdPrice);

    // GST Rate display -> Selectable Dropdown Slabs
    const tdRate = document.createElement("td");
    tdRate.className = "item-gst-rate-cell";
    const selectGst = document.createElement("select");
    selectGst.className = "form-select item-gst-select";
    selectGst.style.padding = "6px 12px";
    selectGst.style.borderRadius = "var(--radius-small)";
    selectGst.style.width = "80px";
    selectGst.innerHTML = `
      <option value="0">0%</option>
      <option value="5">5%</option>
      <option value="12">12%</option>
      <option value="18">18%</option>
      <option value="28">28%</option>
    `;
    tdRate.appendChild(selectGst);
    tr.appendChild(tdRate);

    // Taxable value total column
    const tdTaxable = document.createElement("td");
    tdTaxable.className = "item-taxable-val-cell";
    tdTaxable.textContent = "₹0.00";
    tdTaxable.style.fontWeight = "bold";
    tr.appendChild(tdTaxable);

    // Actions button
    const tdActions = document.createElement("td");
    const btnRemove = document.createElement("button");
    btnRemove.type = "button";
    btnRemove.className = "btn-small delete";
    btnRemove.textContent = "❌";
    btnRemove.style.padding = "4px 8px";
    btnRemove.style.margin = "0";
    btnRemove.addEventListener("click", () => {
      tr.remove();
      recalculateInvoice();
    });
    tdActions.appendChild(btnRemove);
    tr.appendChild(tdActions);

    // Event listeners inside spreadsheet cells
    const validateStock = () => {
      const pId = select.value;
      const product = cachedProducts.find(p => p.id === pId);
      if (!product) {
        stockWarning.textContent = "";
        inputQty.style.borderColor = "var(--color-obsidian)";
        return;
      }
      const qty = parseFloat(inputQty.value) || 0;
      const available = parseFloat(product.current_stock) || 0;
      if (qty > available) {
        stockWarning.style.color = "#c5221f";
        stockWarning.style.fontWeight = "bold";
        stockWarning.textContent = `⚠️ Insufficient stock! Only ${available} ${product.unit || 'PCS'} available.`;
        inputQty.style.borderColor = "#c5221f";
      } else {
        stockWarning.style.color = "#555";
        stockWarning.style.fontWeight = "normal";
        stockWarning.textContent = `In stock: ${available} ${product.unit || 'PCS'}`;
        inputQty.style.borderColor = "var(--color-obsidian)";
      }
    };

    select.addEventListener("change", () => {
      const pId = select.value;
      const product = cachedProducts.find(p => p.id === pId);
      if (product) {
        inputHsn.value = product.hsn_sac_code || "";
        tdUnit.textContent = product.unit || "PCS";
        inputPrice.value = parseFloat(product.selling_price).toFixed(2);
        selectGst.value = String(product.gst_rate);
        tr.dataset.gstRate = product.gst_rate;
        recalculateInvoice();
        validateStock();
      }
    });

    inputQty.addEventListener("input", () => {
      recalculateInvoice();
      validateStock();
    });
    inputPrice.addEventListener("input", recalculateInvoice);
    inputHsn.addEventListener("input", recalculateInvoice);
    selectGst.addEventListener("change", recalculateInvoice);

    // Keyboard navigation (Enter key spawns or traverses rows)
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (tr.nextElementSibling === null) {
          addInvoiceItemRow();
          setTimeout(() => {
            tr.nextElementSibling.querySelector(".item-product-select").focus();
          }, 10);
        } else {
          tr.nextElementSibling.querySelector(".item-product-select").focus();
        }
      }
    });

    invoiceEditorItemsList.appendChild(tr);
    select.focus();
  }

  btnAddInvoiceLine.addEventListener("click", () => {
    addInvoiceItemRow();
  });

  // GST SPLIT ENGINE & TOTALS MATH
  function recalculateInvoice() {
    const rows = invoiceEditorItemsList.querySelectorAll("tr");
    
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    // Get selected POS and state code
    const selectedOption = invSupplyStateSelect.options[invSupplyStateSelect.selectedIndex];
    const posStateCode = selectedOption ? selectedOption.getAttribute("data-code") : "29";
    const isLocal = (posStateCode === "29");

    rows.forEach(row => {
      const qtyInput = row.querySelector(".item-qty-input");
      const priceInput = row.querySelector(".item-price-input");
      const taxableCell = row.querySelector(".item-taxable-val-cell");
      
      const qty = qtyInput ? parseFloat(qtyInput.value) || 0 : 0;
      const price = priceInput ? parseFloat(priceInput.value) || 0 : 0;
      
      const taxableValue = qty * price;
      taxableCell.textContent = `₹${taxableValue.toFixed(2)}`;

      const gstSelect = row.querySelector(".item-gst-select");
      const gstRate = gstSelect ? parseFloat(gstSelect.value) || 0 : 0;

      // Tax Splits logic based on State POS code (29 is Karnataka local)
      if (isLocal) {
        const cgst = taxableValue * (gstRate / 2) / 100;
        const sgst = taxableValue * (gstRate / 2) / 100;
        totalCgst += cgst;
        totalSgst += sgst;
      } else {
        const igst = taxableValue * gstRate / 100;
        totalIgst += igst;
      }

      totalTaxable += taxableValue;
    });

    const unroundedGrand = totalTaxable + totalCgst + totalSgst + totalIgst;
    const roundedGrand = Math.round(unroundedGrand);
    const roundOff = roundedGrand - unroundedGrand;

    // Update real-time summary labels
    document.getElementById("inv-summary-taxable").textContent = `₹${totalTaxable.toFixed(2)}`;
    document.getElementById("inv-summary-cgst").textContent = `₹${totalCgst.toFixed(2)}`;
    document.getElementById("inv-summary-sgst").textContent = `₹${totalSgst.toFixed(2)}`;
    document.getElementById("inv-summary-igst").textContent = `₹${totalIgst.toFixed(2)}`;
    document.getElementById("inv-summary-round-off").textContent = `₹${roundOff.toFixed(2)}`;
    document.getElementById("inv-summary-grand-total").textContent = `₹${roundedGrand.toFixed(2)}`;

    // Toggle Tax display boxes in sidebar totals panel based on supply context
    if (isLocal) {
      document.getElementById("cgst-row").style.display = "flex";
      document.getElementById("sgst-row").style.display = "flex";
      document.getElementById("igst-row").style.display = "none";
    } else {
      document.getElementById("cgst-row").style.display = "none";
      document.getElementById("sgst-row").style.display = "none";
      document.getElementById("igst-row").style.display = "flex";
    }
  }

  // Save Invoice form submit payload
  invoiceForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedOption = invSupplyStateSelect.options[invSupplyStateSelect.selectedIndex];
    const posStateCode = selectedOption ? selectedOption.getAttribute("data-code") : "29";
    const isLocal = (posStateCode === "29");

    const rows = invoiceEditorItemsList.querySelectorAll("tr");
    if (rows.length === 0) {
      alert("Error: Add at least one line item row to the invoice.");
      return;
    }

    const itemsPayload = [];
    let sumTaxable = 0;
    let sumCgst = 0;
    let sumSgst = 0;
    let sumIgst = 0;

    for (const row of rows) {
      const select = row.querySelector(".item-product-select");
      const qtyInput = row.querySelector(".item-qty-input");
      const priceInput = row.querySelector(".item-price-input");
      const hsnInput = row.querySelector(".item-hsn-input");
      const unitCell = row.querySelector(".item-unit-cell");

      const pId = select.value;
      const product = cachedProducts.find(p => p.id === pId);
      if (!product) continue;

      const qty = parseFloat(qtyInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const taxable = qty * price;

      const gstSelect = row.querySelector(".item-gst-select");
      const gstRate = gstSelect ? parseFloat(gstSelect.value) || 0 : 0;
      let cgst = 0, sgst = 0, igst = 0;

      if (isLocal) {
        cgst = taxable * (gstRate / 2) / 100;
        sgst = taxable * (gstRate / 2) / 100;
      } else {
        igst = taxable * gstRate / 100;
      }

      sumTaxable += taxable;
      sumCgst += cgst;
      sumSgst += sgst;
      sumIgst += igst;

      const hsnVal = hsnInput ? hsnInput.value.trim() : "";

      itemsPayload.push({
        product_id: pId,
        product_name: product.name,
        hsn_sac_code: hsnVal !== "" ? hsnVal : null,
        quantity: qty,
        unit: unitCell.textContent,
        unit_price: price,
        gst_rate: gstRate,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        taxable_value: taxable,
        total_amount: taxable + cgst + sgst + igst
      });
    }

    const grandTotalUnrounded = sumTaxable + sumCgst + sumSgst + sumIgst;
    const grandTotalRounded = Math.round(grandTotalUnrounded);
    const roundOff = grandTotalRounded - grandTotalUnrounded;

    const invoicePayload = {
      invoice: {
        customer_id: invCustomerSelect.value,
        invoice_date: invDateInput.value,
        place_of_supply: invSupplyStateSelect.value,
        state_code: posStateCode,
        taxable_value: sumTaxable,
        cgst_amount: sumCgst,
        sgst_amount: sumSgst,
        igst_amount: sumIgst,
        round_off: roundOff,
        grand_total: grandTotalRounded,
        notes: document.getElementById("inv-notes").value.trim(),
        status: "Confirmed" // Default newly created invoices to Confirmed (unpaid/awaiting payment)
      },
      items: itemsPayload
    };

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoicePayload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to submit invoice");

      closeModal("invoice-editor-modal");
      fetchInvoices();
    } catch (error) {
      alert(`Submission Error: ${error.message}`);
    }
  });

  // Delete invoice handler
  async function handleDeleteInvoice(id) {
    if (!confirm(`Are you sure you want to delete invoice ${id}? This will reverse the stock deductions.`)) return;
    try {
      const response = await fetch(`/api/invoices?id=${id}`, {
        method: "DELETE"
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to delete invoice");
      fetchInvoices();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // --- 8. Print Layout Preview Management (A4 formatting & GSTR matching) ---
  async function openPrintInvoice(id) {
    try {
      const response = await fetch(`/api/invoices/detail?id=${id}`);
      if (!response.ok) throw new Error("Failed to fetch invoice details");
      const { invoice, items } = await response.json();

      // Populate business company details from cached settings
      document.getElementById("print-biz-name").textContent = cachedSettings.business_name || "MY BUSINESS";
      
      const addressParts = [];
      if (cachedSettings.business_address) addressParts.push(cachedSettings.business_address);
      if (cachedSettings.business_city) addressParts.push(cachedSettings.business_city);
      document.getElementById("print-biz-address").textContent = addressParts.join(", ") || "Karnataka, India";
      
      document.getElementById("print-biz-gstin").textContent = cachedSettings.business_gstin || "NOT CONFIGURED";
      document.getElementById("print-biz-sign-label").textContent = `For ${cachedSettings.business_name || "MY BUSINESS"}`;
      
      const printLogo = document.getElementById("print-biz-logo");
      if (printLogo) {
        if (cachedSettings.business_logo_path) {
          printLogo.src = cachedSettings.business_logo_path;
          printLogo.style.display = "block";
        } else {
          printLogo.src = "";
          printLogo.style.display = "none";
        }
      }

      const stateLabel = document.getElementById("print-biz-state-label");
      if (stateLabel) {
        const stateName = cachedSettings.business_state || "Karnataka";
        const stateCode = cachedSettings.business_state_code || "29";
        stateLabel.textContent = `State: ${stateName} (${stateCode})`;
      }

      // Populate customer billing details
      document.getElementById("print-cust-name").textContent = invoice.customer_name || "—";
      document.getElementById("print-cust-address").textContent = invoice.customer_billing_address || "No Address Provided";
      document.getElementById("print-cust-phone").textContent = `Phone: ${invoice.customer_phone || "—"}`;
      
      const gstinContainer = document.getElementById("print-cust-gstin-container");
      if (invoice.customer_gstin && invoice.customer_gstin.trim() !== "" && invoice.customer_gstin !== "—") {
        gstinContainer.style.display = "block";
        document.getElementById("print-cust-gstin").textContent = invoice.customer_gstin;
      } else {
        gstinContainer.style.display = "none";
      }

      // Populate invoice summary metadata
      document.getElementById("print-inv-number").textContent = invoice.id;
      document.getElementById("print-inv-date").textContent = invoice.invoice_date;
      document.getElementById("print-inv-pos").textContent = `${invoice.place_of_supply} (${invoice.state_code})`;
      document.getElementById("print-notes").textContent = invoice.notes || "—";

      // Toggle printed table header columns based on supply type
      const isLocal = (invoice.state_code === "29");
      const cgstCols = document.querySelectorAll(".print-col-cgst");
      const sgstCols = document.querySelectorAll(".print-col-sgst");
      const igstCols = document.querySelectorAll(".print-col-igst");

      if (isLocal) {
        cgstCols.forEach(el => el.style.display = "");
        sgstCols.forEach(el => el.style.display = "");
        igstCols.forEach(el => el.style.display = "none");
      } else {
        cgstCols.forEach(el => el.style.display = "none");
        sgstCols.forEach(el => el.style.display = "none");
        igstCols.forEach(el => el.style.display = "");
      }

      // Populate items table rows
      const tbody = document.getElementById("print-items-list");
      tbody.innerHTML = "";
      items.forEach((item, index) => {
        const tr = document.createElement("tr");
        
        const tdIdx = document.createElement("td");
        tdIdx.textContent = index + 1;
        tdIdx.style.textAlign = "center";
        tdIdx.style.padding = "8px";
        tdIdx.style.borderRight = "1px solid #000000";
        tdIdx.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdIdx);

        const tdDesc = document.createElement("td");
        tdDesc.textContent = item.product_name;
        tdDesc.style.padding = "8px";
        tdDesc.style.borderRight = "1px solid #000000";
        tdDesc.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdDesc);

        const tdHsn = document.createElement("td");
        tdHsn.textContent = item.hsn_sac_code || "—";
        tdHsn.style.textAlign = "center";
        tdHsn.style.padding = "8px";
        tdHsn.style.borderRight = "1px solid #000000";
        tdHsn.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdHsn);

        const tdQty = document.createElement("td");
        tdQty.textContent = item.quantity;
        tdQty.style.textAlign = "center";
        tdQty.style.padding = "8px";
        tdQty.style.borderRight = "1px solid #000000";
        tdQty.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdQty);

        const tdUnit = document.createElement("td");
        tdUnit.textContent = item.unit;
        tdUnit.style.textAlign = "center";
        tdUnit.style.padding = "8px";
        tdUnit.style.borderRight = "1px solid #000000";
        tdUnit.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdUnit);

        const tdPrice = document.createElement("td");
        tdPrice.textContent = parseFloat(item.unit_price).toFixed(2);
        tdPrice.style.textAlign = "right";
        tdPrice.style.padding = "8px";
        tdPrice.style.borderRight = "1px solid #000000";
        tdPrice.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdPrice);

        const tdAmt = document.createElement("td");
        tdAmt.textContent = parseFloat(item.taxable_value).toFixed(2);
        tdAmt.style.textAlign = "right";
        tdAmt.style.padding = "8px";
        tdAmt.style.borderRight = "1px solid #000000";
        tdAmt.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdAmt);

        // CGST Rate & Amount
        const tdCr = document.createElement("td");
        tdCr.className = "print-col-cgst";
        tdCr.textContent = isLocal ? `${(item.gst_rate / 2)}%` : "0%";
        tdCr.style.textAlign = "center";
        tdCr.style.padding = "8px";
        tdCr.style.borderRight = "1px solid #000000";
        tdCr.style.borderBottom = "1px solid #000000";
        if (!isLocal) tdCr.style.display = "none";
        tr.appendChild(tdCr);

        const tdCa = document.createElement("td");
        tdCa.className = "print-col-cgst";
        tdCa.textContent = parseFloat(item.cgst_amount).toFixed(2);
        tdCa.style.textAlign = "right";
        tdCa.style.padding = "8px";
        tdCa.style.borderRight = "1px solid #000000";
        tdCa.style.borderBottom = "1px solid #000000";
        if (!isLocal) tdCa.style.display = "none";
        tr.appendChild(tdCa);

        // SGST Rate & Amount
        const tdSr = document.createElement("td");
        tdSr.className = "print-col-sgst";
        tdSr.textContent = isLocal ? `${(item.gst_rate / 2)}%` : "0%";
        tdSr.style.textAlign = "center";
        tdSr.style.padding = "8px";
        tdSr.style.borderRight = "1px solid #000000";
        tdSr.style.borderBottom = "1px solid #000000";
        if (!isLocal) tdSr.style.display = "none";
        tr.appendChild(tdSr);

        const tdSa = document.createElement("td");
        tdSa.className = "print-col-sgst";
        tdSa.textContent = parseFloat(item.sgst_amount).toFixed(2);
        tdSa.style.textAlign = "right";
        tdSa.style.padding = "8px";
        tdSa.style.borderRight = "1px solid #000000";
        tdSa.style.borderBottom = "1px solid #000000";
        if (!isLocal) tdSa.style.display = "none";
        tr.appendChild(tdSa);

        // IGST Rate & Amount
        const tdIr = document.createElement("td");
        tdIr.className = "print-col-igst";
        tdIr.textContent = !isLocal ? `${item.gst_rate}%` : "0%";
        tdIr.style.textAlign = "center";
        tdIr.style.padding = "8px";
        tdIr.style.borderRight = "1px solid #000000";
        tdIr.style.borderBottom = "1px solid #000000";
        if (isLocal) tdIr.style.display = "none";
        tr.appendChild(tdIr);

        const tdIa = document.createElement("td");
        tdIa.className = "print-col-igst";
        tdIa.textContent = parseFloat(item.igst_amount).toFixed(2);
        tdIa.style.textAlign = "right";
        tdIa.style.padding = "8px";
        tdIa.style.borderRight = "1px solid #000000";
        tdIa.style.borderBottom = "1px solid #000000";
        if (isLocal) tdIa.style.display = "none";
        tr.appendChild(tdIa);

        // Total Amount
        const tdTot = document.createElement("td");
        tdTot.textContent = parseFloat(item.total_amount).toFixed(2);
        tdTot.style.textAlign = "right";
        tdTot.style.padding = "8px";
        tdTot.style.borderRight = "1px solid #000000";
        tdTot.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdTot);

        tbody.appendChild(tr);
      });

      // Append a bolded summary row at the bottom of the items table
      const trSum = document.createElement("tr");
      trSum.style.fontWeight = "bold";
      trSum.style.backgroundColor = "#f9f9f9";

      // 1. Index
      const tdIdxSum = document.createElement("td");
      tdIdxSum.textContent = "";
      tdIdxSum.style.padding = "8px";
      tdIdxSum.style.borderRight = "1px solid #000000";
      tdIdxSum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdIdxSum);

      // 2. Description
      const tdDescSum = document.createElement("td");
      tdDescSum.textContent = "TOTAL";
      tdDescSum.style.padding = "8px";
      tdDescSum.style.borderRight = "1px solid #000000";
      tdDescSum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdDescSum);

      // 3. HSN
      const tdHsnSum = document.createElement("td");
      tdHsnSum.textContent = "";
      tdHsnSum.style.padding = "8px";
      tdHsnSum.style.borderRight = "1px solid #000000";
      tdHsnSum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdHsnSum);

      // 4. Qty Sum
      const tdQtySum = document.createElement("td");
      tdQtySum.textContent = items.reduce((sum, item) => sum + item.quantity, 0);
      tdQtySum.style.textAlign = "center";
      tdQtySum.style.padding = "8px";
      tdQtySum.style.borderRight = "1px solid #000000";
      tdQtySum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdQtySum);

      // 5. Unit
      const tdUnitSum = document.createElement("td");
      tdUnitSum.textContent = "";
      tdUnitSum.style.padding = "8px";
      tdUnitSum.style.borderRight = "1px solid #000000";
      tdUnitSum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdUnitSum);

      // 6. Rate
      const tdRateSum = document.createElement("td");
      tdRateSum.textContent = "";
      tdRateSum.style.padding = "8px";
      tdRateSum.style.borderRight = "1px solid #000000";
      tdRateSum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdRateSum);

      // 7. Taxable Value Sum
      const tdAmtSum = document.createElement("td");
      tdAmtSum.textContent = parseFloat(invoice.taxable_value).toFixed(2);
      tdAmtSum.style.textAlign = "right";
      tdAmtSum.style.padding = "8px";
      tdAmtSum.style.borderRight = "1px solid #000000";
      tdAmtSum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdAmtSum);

      // 8. CGST Rate
      const tdCrSum = document.createElement("td");
      tdCrSum.className = "print-col-cgst";
      tdCrSum.textContent = "";
      tdCrSum.style.padding = "8px";
      tdCrSum.style.borderRight = "1px solid #000000";
      tdCrSum.style.borderBottom = "1px solid #000000";
      if (!isLocal) tdCrSum.style.display = "none";
      trSum.appendChild(tdCrSum);

      // 9. CGST Amount Sum
      const tdCaSum = document.createElement("td");
      tdCaSum.className = "print-col-cgst";
      tdCaSum.textContent = parseFloat(invoice.cgst_amount).toFixed(2);
      tdCaSum.style.textAlign = "right";
      tdCaSum.style.padding = "8px";
      tdCaSum.style.borderRight = "1px solid #000000";
      tdCaSum.style.borderBottom = "1px solid #000000";
      if (!isLocal) tdCaSum.style.display = "none";
      trSum.appendChild(tdCaSum);

      // 10. SGST Rate
      const tdSrSum = document.createElement("td");
      tdSrSum.className = "print-col-sgst";
      tdSrSum.textContent = "";
      tdSrSum.style.padding = "8px";
      tdSrSum.style.borderRight = "1px solid #000000";
      tdSrSum.style.borderBottom = "1px solid #000000";
      if (!isLocal) tdSrSum.style.display = "none";
      trSum.appendChild(tdSrSum);

      // 11. SGST Amount Sum
      const tdSaSum = document.createElement("td");
      tdSaSum.className = "print-col-sgst";
      tdSaSum.textContent = parseFloat(invoice.sgst_amount).toFixed(2);
      tdSaSum.style.textAlign = "right";
      tdSaSum.style.padding = "8px";
      tdSaSum.style.borderRight = "1px solid #000000";
      tdSaSum.style.borderBottom = "1px solid #000000";
      if (!isLocal) tdSaSum.style.display = "none";
      trSum.appendChild(tdSaSum);

      // 12. IGST Rate
      const tdIrSum = document.createElement("td");
      tdIrSum.className = "print-col-igst";
      tdIrSum.textContent = "";
      tdIrSum.style.padding = "8px";
      tdIrSum.style.borderRight = "1px solid #000000";
      tdIrSum.style.borderBottom = "1px solid #000000";
      if (isLocal) tdIrSum.style.display = "none";
      trSum.appendChild(tdIrSum);

      // 13. IGST Amount Sum
      const tdIaSum = document.createElement("td");
      tdIaSum.className = "print-col-igst";
      tdIaSum.textContent = parseFloat(invoice.igst_amount).toFixed(2);
      tdIaSum.style.textAlign = "right";
      tdIaSum.style.padding = "8px";
      tdIaSum.style.borderRight = "1px solid #000000";
      tdIaSum.style.borderBottom = "1px solid #000000";
      if (isLocal) tdIaSum.style.display = "none";
      trSum.appendChild(tdIaSum);

      // 14. Total Amount Sum
      const tdTotSum = document.createElement("td");
      tdTotSum.textContent = parseFloat(invoice.grand_total - invoice.round_off).toFixed(2);
      tdTotSum.style.textAlign = "right";
      tdTotSum.style.padding = "8px";
      tdTotSum.style.borderRight = "1px solid #000000";
      tdTotSum.style.borderBottom = "1px solid #000000";
      trSum.appendChild(tdTotSum);

      tbody.appendChild(trSum);

      // Populate summary totals
      document.getElementById("print-summary-taxable").textContent = `₹${parseFloat(invoice.taxable_value).toFixed(2)}`;
      document.getElementById("print-summary-cgst").textContent = `₹${parseFloat(invoice.cgst_amount).toFixed(2)}`;
      document.getElementById("print-summary-sgst").textContent = `₹${parseFloat(invoice.sgst_amount).toFixed(2)}`;
      document.getElementById("print-summary-igst").textContent = `₹${parseFloat(invoice.igst_amount).toFixed(2)}`;
      document.getElementById("print-summary-round-off").textContent = `₹${parseFloat(invoice.round_off).toFixed(2)}`;
      document.getElementById("print-summary-grand-total").textContent = `₹${parseFloat(invoice.grand_total).toFixed(2)}`;

      const printPaidVal = parseFloat(invoice.paid_amount || 0);
      const printDueVal = parseFloat(invoice.grand_total) - printPaidVal;
      document.getElementById("print-summary-paid").textContent = `₹${printPaidVal.toFixed(2)}`;
      document.getElementById("print-summary-due").textContent = `₹${printDueVal.toFixed(2)}`;

      // Toggle display of CGST/SGST/IGST in printed invoice based on locale
      if (isLocal) {
        document.getElementById("print-row-cgst").style.display = "flex";
        document.getElementById("print-row-sgst").style.display = "flex";
        document.getElementById("print-row-igst").style.display = "none";
      } else {
        document.getElementById("print-row-cgst").style.display = "none";
        document.getElementById("print-row-sgst").style.display = "none";
        document.getElementById("print-row-igst").style.display = "flex";
      }

      // Generate HSN Tax Summary table rows dynamically
      const hsnSummaryMap = {};
      items.forEach(item => {
        const hsn = item.hsn_sac_code || "N/A";
        if (!hsnSummaryMap[hsn]) {
          hsnSummaryMap[hsn] = {
            taxableValue: 0,
            gstRate: item.gst_rate,
            cgst: 0,
            sgst: 0,
            igst: 0,
            totalTax: 0
          };
        }
        hsnSummaryMap[hsn].taxableValue += item.taxable_value;
        hsnSummaryMap[hsn].cgst += item.cgst_amount;
        hsnSummaryMap[hsn].sgst += item.sgst_amount;
        hsnSummaryMap[hsn].igst += item.igst_amount;
        hsnSummaryMap[hsn].totalTax += (item.cgst_amount + item.sgst_amount + item.igst_amount);
      });

      const hsnTbody = document.getElementById("print-hsn-summary-list");
      hsnTbody.innerHTML = "";
      Object.keys(hsnSummaryMap).forEach(hsn => {
        const data = hsnSummaryMap[hsn];
        const tr = document.createElement("tr");

        const tdH = document.createElement("td");
        tdH.textContent = hsn;
        tdH.style.padding = "6px";
        tdH.style.borderRight = "1px solid #000000";
        tdH.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdH);

        const tdV = document.createElement("td");
        tdV.textContent = data.taxableValue.toFixed(2);
        tdV.style.textAlign = "right";
        tdV.style.padding = "6px";
        tdV.style.borderRight = "1px solid #000000";
        tdV.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdV);

        // CGST rate & amount
        const tdCr = document.createElement("td");
        tdCr.textContent = isLocal ? `${(data.gstRate / 2)}%` : "0%";
        tdCr.style.textAlign = "center";
        tdCr.style.padding = "6px";
        tdCr.style.borderRight = "1px solid #000000";
        tdCr.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdCr);

        const tdCa = document.createElement("td");
        tdCa.textContent = data.cgst.toFixed(2);
        tdCa.style.textAlign = "right";
        tdCa.style.padding = "6px";
        tdCa.style.borderRight = "1px solid #000000";
        tdCa.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdCa);

        // SGST rate & amount
        const tdSr = document.createElement("td");
        tdSr.textContent = isLocal ? `${(data.gstRate / 2)}%` : "0%";
        tdSr.style.textAlign = "center";
        tdSr.style.padding = "6px";
        tdSr.style.borderRight = "1px solid #000000";
        tdSr.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdSr);

        const tdSa = document.createElement("td");
        tdSa.textContent = data.sgst.toFixed(2);
        tdSa.style.textAlign = "right";
        tdSa.style.padding = "6px";
        tdSa.style.borderRight = "1px solid #000000";
        tdSa.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdSa);

        // IGST rate & amount
        const tdIr = document.createElement("td");
        tdIr.textContent = !isLocal ? `${data.gstRate}%` : "0%";
        tdIr.style.textAlign = "center";
        tdIr.style.padding = "6px";
        tdIr.style.borderRight = "1px solid #000000";
        tdIr.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdIr);

        const tdIa = document.createElement("td");
        tdIa.textContent = data.igst.toFixed(2);
        tdIa.style.textAlign = "right";
        tdIa.style.padding = "6px";
        tdIa.style.borderRight = "1px solid #000000";
        tdIa.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdIa);

        // Total tax amount
        const tdTa = document.createElement("td");
        tdTa.textContent = data.totalTax.toFixed(2);
        tdTa.style.textAlign = "right";
        tdTa.style.padding = "6px";
        tdTa.style.borderRight = "1px solid #000000";
        tdTa.style.borderBottom = "1px solid #000000";
        tr.appendChild(tdTa);

        hsnTbody.appendChild(tr);
      });


      openModal("invoice-print-modal");
    } catch (error) {
      alert(`Print Preview Error: ${error.message}`);
    }
  }

  // Print button handler — DOM-measurement-based pagination engine
  btnTriggerPrint.addEventListener("click", buildPaginatedPrint);

  function buildPaginatedPrint() {
    const printArea = document.getElementById("print-area");
    const srcTable  = printArea ? printArea.querySelector("table") : null;
    const srcThead  = srcTable  ? srcTable.querySelector("thead")  : null;
    const srcTbody  = srcTable  ? srcTable.querySelector("tbody")  : null;
    if (!srcTable || !srcTbody) { window.print(); return; }

    const allRows      = Array.from(srcTbody.querySelectorAll("tr"));
    if (allRows.length === 0) { window.print(); return; }

    const headerBlock  = document.getElementById("print-header-block");
    const addressBlock = document.getElementById("print-address-block");
    const summaryBlock = document.getElementById("print-summary-block");
    const hsnLabel     = document.getElementById("print-hsn-heading");
    const hsnTable     = document.getElementById("print-hsn-table");
    const sigBlock     = document.getElementById("print-signatures-block");

    // ── Measure everything at EXACT print content width using sandbox ─────────
    // A4 = 210mm wide x 297mm high.
    // 15mm margins on left and right -> content width = 180mm.
    // 15mm margins top & bottom -> 267mm theoretical height.
    // We use a safe target printable height of 235mm (~888px at 96dpi) to account
    // for printer hardware unprintable borders, browser header/footers, and line-heights.
    const MM_TO_PX    = 96 / 25.4;
    const USABLE_H_PX = Math.round(255 * MM_TO_PX); // ~963px (allows single-page invoices with up to ~8 items to stay on 1 page)

    const sandbox = document.createElement("div");
    sandbox.style.cssText = [
      "position:absolute", "left:-99999px", "top:0",
      "width:calc(210mm - 38mm)",   // 172mm exact print content width (210mm - 30mm margins - 8mm padding)
      "visibility:hidden", "overflow:visible",
      "font-family:'DM Sans',sans-serif", "font-size:11px"
    ].join(";");
    document.body.appendChild(sandbox);

    function measureBlock(el) {
      if (!el) return 0;
      const c = el.cloneNode(true);
      sandbox.appendChild(c);
      const h = c.offsetHeight;
      c.remove();
      return h;
    }

    const headerH  = measureBlock(headerBlock)  + 24; // + margin-bottom
    const addressH = measureBlock(addressBlock) + 24;

    // Measure mini continuation header
    const tempMini = document.createElement("div");
    tempMini.className = "inv-continuation-header";
    tempMini.innerHTML = "<span><b>TEST</b> — Invoice (Continued)</span><span>Page 1 of 2</span>";
    sandbox.appendChild(tempMini);
    const miniHeaderH = tempMini.offsetHeight + 12;
    tempMini.remove();

    // Measure all summary blocks together
    const summaryH = measureBlock(summaryBlock)
                   + measureBlock(hsnLabel)
                   + measureBlock(hsnTable)
                   + measureBlock(sigBlock)
                   + 40;

    // Measure table header, rows, bfTr, and cTr in a table context
    const measTable = document.createElement("table");
    measTable.className = "inv-print-table";
    measTable.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;";
    if (srcThead) measTable.appendChild(srcThead.cloneNode(true));
    const measTbody = document.createElement("tbody");
    measTable.appendChild(measTbody);
    sandbox.appendChild(measTable);

    const theadH = (measTable.querySelector("thead") || {}).offsetHeight || 36;

    // Measure dummy Brought Forward and Continued rows
    const dummyBf = document.createElement("tr");
    dummyBf.className = "inv-row-bf";
    dummyBf.innerHTML = "<td colspan='20'>← Carried forward</td>";
    measTbody.appendChild(dummyBf);
    const bfTrH = dummyBf.offsetHeight || 28;
    dummyBf.remove();

    const dummyC = document.createElement("tr");
    dummyC.className = "inv-row-continues";
    dummyC.innerHTML = "<td colspan='20'>Continued →</td>";
    measTbody.appendChild(dummyC);
    const cTrH = dummyC.offsetHeight || 28;
    dummyC.remove();

    // Measure exact height of every item row
    const rowHeights = allRows.map(tr => {
      const clone = tr.cloneNode(true);
      measTbody.appendChild(clone);
      const h = clone.offsetHeight || 28;
      clone.remove();
      return h;
    });

    sandbox.remove(); // Clean up sandbox

    // ── Bin-pack rows into pages deterministically ────────────────────────────
    const pages = [];
    let curPageRows = [];
    let curH = 0;
    let pageIndex = 0;

    for (let i = 0; i < allRows.length; i++) {
      const rh = rowHeights[i];
      const isLastRow = (i === allRows.length - 1);

      // Maximum available height on current page for table rows
      const maxSpace = (pageIndex === 0)
        ? (USABLE_H_PX - headerH - addressH - theadH)
        : (USABLE_H_PX - miniHeaderH - theadH - bfTrH);

      if (!isLastRow) {
        // Intermediate row: page must also accommodate cTrH if this row is added
        if (curPageRows.length > 0 && (curH + rh + cTrH > maxSpace)) {
          pages.push(curPageRows);
          curPageRows = [i];
          curH = rh;
          pageIndex++;
        } else {
          curPageRows.push(i);
          curH += rh;
        }
      } else {
        // Last row: must fit row i AND the summary block on current page
        if (curPageRows.length > 0 && (curH + rh + summaryH > maxSpace)) {
          pages.push(curPageRows);
          curPageRows = [i];
          curH = rh;
          pageIndex++;
        } else {
          curPageRows.push(i);
          curH += rh;
        }
      }
    }

    if (curPageRows.length > 0) {
      pages.push(curPageRows);
    }

    // Always build paginated container for consistent print rendering across single and multi-page invoices

    const totalPages = pages.length;

    // ── Clone reusable elements ───────────────────────────────────────────────
    const theadClone   = srcThead ? srcThead.cloneNode(true) : null;
    const summaryClone = summaryBlock ? summaryBlock.cloneNode(true) : null;
    const hsnLblClone  = hsnLabel    ? hsnLabel.cloneNode(true)    : null;
    const hsnTblClone  = hsnTable    ? hsnTable.cloneNode(true)    : null;
    const sigClone     = sigBlock    ? sigBlock.cloneNode(true)    : null;
    const invNumber    = (document.getElementById("print-inv-number") || {}).textContent || "";
    const bizName      = (document.getElementById("print-biz-name")   || {}).textContent || "";

    // ── Build paginated print container ───────────────────────────────────────
    const container = document.createElement("div");
    container.id = "paginated-print-root";

    pages.forEach((rowIdxList, pi) => {
      const isLastPg = (pi === totalPages - 1);
      const pageNum  = pi + 1;

      const pg = document.createElement("div");
      pg.className = "inv-print-page";
      if (!isLastPg) { pg.style.pageBreakAfter = "always"; pg.style.breakAfter = "page"; }

      // Header
      if (pi === 0) {
        if (headerBlock)  pg.appendChild(headerBlock.cloneNode(true));
        if (addressBlock) pg.appendChild(addressBlock.cloneNode(true));
      } else {
        const mh = document.createElement("div");
        mh.className = "inv-continuation-header";
        mh.innerHTML = "<span><b>" + bizName + "</b> \u2014 Invoice " + invNumber + " (Continued)</span>"
                     + "<span>Page " + pageNum + " of " + totalPages + "</span>";
        pg.appendChild(mh);
      }

      // Items table
      const tbl = document.createElement("table");
      tbl.className = "inv-print-table";
      if (theadClone) tbl.appendChild(theadClone.cloneNode(true));
      const tb = document.createElement("tbody");

      if (pi > 0) {
        const bfTr = document.createElement("tr");
        bfTr.className = "inv-row-bf";
        const bfTd = document.createElement("td"); bfTd.colSpan = 20;
        bfTd.textContent = "\u2190 Carried forward from page " + (pageNum - 1);
        bfTr.appendChild(bfTd); tb.appendChild(bfTr);
      }

      rowIdxList.forEach(i => tb.appendChild(allRows[i].cloneNode(true)));

      if (!isLastPg) {
        const cTr = document.createElement("tr");
        cTr.className = "inv-row-continues";
        const cTd = document.createElement("td"); cTd.colSpan = 20;
        cTd.textContent = "Continued on page " + (pageNum + 1) + " of " + totalPages + " \u2192";
        cTr.appendChild(cTd); tb.appendChild(cTr);
      }

      tbl.appendChild(tb);
      pg.appendChild(tbl);

      // Summary & signature blocks on last page — wrapped in an unbroken footer group
      if (isLastPg) {
        const footerGroup = document.createElement("div");
        footerGroup.className = "inv-footer-group";
        footerGroup.style.cssText = "page-break-inside:avoid !important;break-inside:avoid !important;";
        if (summaryClone) footerGroup.appendChild(summaryClone.cloneNode(true));
        if (hsnLblClone)  footerGroup.appendChild(hsnLblClone.cloneNode(true));
        if (hsnTblClone)  footerGroup.appendChild(hsnTblClone.cloneNode(true));
        if (sigClone)     footerGroup.appendChild(sigClone.cloneNode(true));
        pg.appendChild(footerGroup);
      }

      container.appendChild(pg);
    });

    // ── Inject, print, remove ─────────────────────────────────────────────────
    document.body.appendChild(container);
    const cleanup = () => { container.remove(); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }
  btnClosePrint.addEventListener("click", () => {
    closeModal("invoice-print-modal");
  });

  // --- Record Payment Modal Controllers ---
  const paymentModal = document.getElementById("payment-modal");
  const paymentForm = document.getElementById("payment-form");
  const btnCancelPayment = document.getElementById("btn-cancel-payment");

  function openRecordPaymentModal(invoice, dueVal) {
    document.getElementById("pay-invoice-no").value = invoice.id;
    document.getElementById("pay-balance-due-display").value = dueVal.toFixed(2);
    document.getElementById("pay-amount").value = dueVal.toFixed(2);
    document.getElementById("pay-amount").max = dueVal.toFixed(2);
    document.getElementById("pay-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("pay-ref-no").value = "";
    document.getElementById("pay-notes").value = "";
    paymentModal.classList.add("active");
  }

  btnCancelPayment.addEventListener("click", () => {
    paymentModal.classList.remove("active");
  });

  paymentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      invoice_number: document.getElementById("pay-invoice-no").value,
      amount: parseFloat(document.getElementById("pay-amount").value),
      payment_date: document.getElementById("pay-date").value,
      payment_method: document.getElementById("pay-method").value,
      reference_number: document.getElementById("pay-ref-no").value.trim(),
      notes: document.getElementById("pay-notes").value.trim()
    };

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to record payment");
      
      paymentModal.classList.remove("active");
      fetchInvoices();
    } catch (err) {
      alert("Error: " + err.message);
    }
  });

  // ==========================================
  // --- 9. PURCHASES & EXPENSES SYSTEM ---
  // ==========================================

  // --- Suppliers ---
  const supplierModal = document.getElementById("supplier-modal");
  const supplierForm = document.getElementById("supplier-form");
  const btnCancelSupplier = document.getElementById("btn-cancel-supplier");
  const btnQuickSupplier = document.getElementById("btn-quick-supplier");
  const selectSupState = document.getElementById("sup-state");
  const inputSupStateCode = document.getElementById("sup-state-code");

  const supStateCodes = {
    "Karnataka": "29",
    "Maharashtra": "27",
    "Delhi": "07",
    "Tamil Nadu": "33",
    "Telangana": "36"
  };

  if (selectSupState && inputSupStateCode) {
    selectSupState.addEventListener("change", () => {
      inputSupStateCode.value = supStateCodes[selectSupState.value] || "29";
    });
  }

  if (btnQuickSupplier) {
    btnQuickSupplier.addEventListener("click", () => {
      document.getElementById("sup-name").value = "";
      document.getElementById("sup-gstin").value = "";
      document.getElementById("sup-phone").value = "";
      document.getElementById("sup-email").value = "";
      document.getElementById("sup-address").value = "";
      document.getElementById("sup-state").value = "Karnataka";
      document.getElementById("sup-state-code").value = "29";
      supplierModal.classList.add("active");
    });
  }

  if (btnCancelSupplier) {
    btnCancelSupplier.addEventListener("click", () => {
      supplierModal.classList.remove("active");
    });
  }

  if (supplierForm) {
    supplierForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById("sup-name").value.trim(),
        gstin: document.getElementById("sup-gstin").value.trim(),
        phone: document.getElementById("sup-phone").value.trim(),
        email: document.getElementById("sup-email").value.trim(),
        address: document.getElementById("sup-address").value.trim(),
        state: document.getElementById("sup-state").value,
        state_code: document.getElementById("sup-state-code").value
      };

      try {
        const res = await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to create supplier");

        supplierModal.classList.remove("active");
        await loadSuppliersDropdown();
        // Auto-select the newly added supplier
        const select = document.getElementById("pur-supplier-id");
        if (select) {
          // Find option with name match
          for (let option of select.options) {
            if (option.text.startsWith(payload.name)) {
              select.value = option.value;
              break;
            }
          }
        }
      } catch (err) {
        alert("Error adding supplier: " + err.message);
      }
    });
  }

  async function loadSuppliersDropdown() {
    try {
      const res = await fetch("/api/suppliers");
      if (!res.ok) throw new Error("Failed to load suppliers");
      const list = await res.json();
      const select = document.getElementById("pur-supplier-id");
      if (select) {
        select.innerHTML = '<option value="">-- SELECT SUPPLIER --</option>' +
          list.map(s => `<option value="${s.id}">${s.name} (GSTIN: ${s.gstin || "N/A"})</option>`).join("");
      }
    } catch (err) {
      console.error("Load suppliers dropdown error:", err);
    }
  }

  // --- Purchases Editor ---
  const purchaseModal = document.getElementById("purchase-modal");
  const purchaseForm = document.getElementById("purchase-form");
  const btnCancelPurchase = document.getElementById("btn-cancel-purchase");
  const btnCreatePurchase = document.getElementById("btn-create-purchase");
  const purchaseItemsBody = document.getElementById("purchase-items-body");
  const btnAddPurchaseRow = document.getElementById("btn-add-purchase-row");

  if (btnCreatePurchase) {
    btnCreatePurchase.addEventListener("click", async () => {
      await loadSuppliersDropdown();
      purchaseItemsBody.innerHTML = "";
      
      // Load next sequence number
      try {
        const res = await fetch("/api/purchases/next-number");
        if (res.ok) {
          const nextData = await res.json();
          document.getElementById("pur-id").value = nextData.next_number;
        }
      } catch (err) {
        console.error("Next purchase number error:", err);
      }

      document.getElementById("pur-supplier-id").value = "";
      document.getElementById("pur-supplier-inv-no").value = "";
      document.getElementById("pur-date").value = new Date().toISOString().split("T")[0];
      document.getElementById("pur-status").value = "Paid";
      document.getElementById("pur-file").value = "";

      createPurchaseGridRow();
      purchaseModal.classList.add("active");
    });
  }

  if (btnCancelPurchase) {
    btnCancelPurchase.addEventListener("click", () => {
      purchaseModal.classList.remove("active");
    });
  }

  if (btnAddPurchaseRow) {
    btnAddPurchaseRow.addEventListener("click", () => {
      createPurchaseGridRow();
    });
  }

  function createPurchaseGridRow() {
    const tr = document.createElement("tr");

    const tdProd = document.createElement("td");
    const select = document.createElement("select");
    select.className = "form-select pur-prod-select";
    select.required = true;
    select.innerHTML = '<option value="">-- SELECT PRODUCT --</option>' + 
      '<option value="NEW_PRODUCT" style="font-weight: bold; color: #fc5000;">+ ADD NEW PRODUCT...</option>' +
      cachedProducts.map(p => `<option value="${p.id}">${p.name} (SKU: ${p.sku})</option>`).join("");
    tdProd.appendChild(select);
    tr.appendChild(tdProd);

    const tdQty = document.createElement("td");
    const inputQty = document.createElement("input");
    inputQty.type = "number";
    inputQty.className = "pur-qty-input";
    inputQty.min = "1";
    inputQty.value = "1";
    inputQty.required = true;
    inputQty.style.textAlign = "center";
    tdQty.appendChild(inputQty);
    tr.appendChild(tdQty);

    const tdPrice = document.createElement("td");
    const inputPrice = document.createElement("input");
    inputPrice.type = "number";
    inputPrice.className = "pur-price-input";
    inputPrice.min = "0.01";
    inputPrice.step = "0.01";
    inputPrice.required = true;
    inputPrice.placeholder = "0.00";
    inputPrice.style.textAlign = "right";
    tdPrice.appendChild(inputPrice);
    tr.appendChild(tdPrice);

    const tdGst = document.createElement("td");
    const selectGst = document.createElement("select");
    selectGst.className = "form-select pur-gst-select";
    selectGst.required = true;
    selectGst.innerHTML = `
      <option value="0">0%</option>
      <option value="5">5%</option>
      <option value="12">12%</option>
      <option value="18" selected>18%</option>
      <option value="28">28%</option>
    `;
    tdGst.appendChild(selectGst);
    tr.appendChild(tdGst);

    const tdAction = document.createElement("td");
    tdAction.style.textAlign = "center";
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn-small delete";
    btnDel.textContent = "✕";
    btnDel.addEventListener("click", () => {
      tr.remove();
      recalculatePurchase();
    });
    tdAction.appendChild(btnDel);
    tr.appendChild(tdAction);

    select.addEventListener("change", () => {
      if (select.value === "NEW_PRODUCT") {
        activeSelectForQuickProductAdd = select;
        isEditingProduct = false;
        prodModalTitle.textContent = "ADD PRODUCT";
        prodForm.reset();
        document.getElementById("prod-id").readOnly = false;
        document.getElementById("prod-stock").value = "0";
        openModal("product-modal");
        return;
      }
      const p = cachedProducts.find(p => p.id === select.value);
      if (p) {
        inputPrice.value = parseFloat(p.purchase_price || 0).toFixed(2);
        selectGst.value = String(p.gst_rate || 18);
      }
      recalculatePurchase();
    });

    inputQty.addEventListener("input", recalculatePurchase);
    inputPrice.addEventListener("input", recalculatePurchase);
    selectGst.addEventListener("change", recalculatePurchase);

    purchaseItemsBody.appendChild(tr);
    recalculatePurchase();
  }

  if (purchaseItemsBody) {
    purchaseItemsBody.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const target = e.target;
        if (target.classList.contains("pur-qty-input") || target.classList.contains("pur-price-input")) {
          e.preventDefault();
          const rows = purchaseItemsBody.querySelectorAll("tr");
          const currentRow = target.closest("tr");
          if (rows[rows.length - 1] === currentRow) {
            createPurchaseGridRow();
            const nextRow = purchaseItemsBody.lastElementChild;
            nextRow.querySelector(".pur-prod-select").focus();
          } else {
            const nextRow = currentRow.nextElementSibling;
            nextRow.querySelector(".pur-qty-input").focus();
          }
        }
      }
    });
  }

  function recalculatePurchase() {
    let subtotalTaxable = 0;
    let totalGst = 0;

    const rows = purchaseItemsBody.querySelectorAll("tr");
    rows.forEach(row => {
      const prodVal = row.querySelector(".pur-prod-select").value;
      const qtyVal = parseFloat(row.querySelector(".pur-qty-input").value) || 0;
      const priceVal = parseFloat(row.querySelector(".pur-price-input").value) || 0;
      const gstRate = parseFloat(row.querySelector(".pur-gst-select").value) || 0;

      if (prodVal && qtyVal > 0 && priceVal > 0) {
        const taxable = qtyVal * priceVal;
        const gst = taxable * (gstRate / 100);

        subtotalTaxable += taxable;
        totalGst += gst;
      }
    });

    const grandTotal = subtotalTaxable + totalGst;
    document.getElementById("pur-calc-taxable").textContent = `₹${subtotalTaxable.toFixed(2)}`;
    document.getElementById("pur-calc-gst").textContent = `₹${totalGst.toFixed(2)}`;
    document.getElementById("pur-calc-total").textContent = `₹${grandTotal.toFixed(2)}`;
  }

  if (purchaseForm) {
    purchaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const purchaseNo = document.getElementById("pur-id").value;
      const supplierId = parseInt(document.getElementById("pur-supplier-id").value);
      const supplierInvNo = document.getElementById("pur-supplier-inv-no").value.trim();
      const invoiceDate = document.getElementById("pur-date").value;
      const paymentStatus = document.getElementById("pur-status").value;

      const items = [];
      const rows = purchaseItemsBody.querySelectorAll("tr");
      rows.forEach(row => {
        const prodId = row.querySelector(".pur-prod-select").value;
        const qty = parseFloat(row.querySelector(".pur-qty-input").value) || 0;
        const unitPrice = parseFloat(row.querySelector(".pur-price-input").value) || 0;
        const gstRate = parseFloat(row.querySelector(".pur-gst-select").value) || 0;

        if (prodId && qty > 0 && unitPrice > 0) {
          const taxableValue = qty * unitPrice;
          const gstAmount = taxableValue * (gstRate / 100);
          const totalAmount = taxableValue + gstAmount;

          items.push({
            product_id: prodId,
            quantity: qty,
            unit_price: unitPrice,
            taxable_value: taxableValue,
            gst_rate: gstRate,
            gst_amount: gstAmount,
            total_amount: totalAmount
          });
        }
      });

      if (items.length === 0) {
        alert("Please add at least one valid product line item.");
        return;
      }

      const taxableTotal = items.reduce((sum, item) => sum + item.taxable_value, 0);
      const gstTotal = items.reduce((sum, item) => sum + item.gst_amount, 0);
      const grandTotal = taxableTotal + gstTotal;

      const payload = {
        purchase: {
          id: purchaseNo,
          supplier_id: supplierId,
          supplier_invoice_number: supplierInvNo,
          invoice_date: invoiceDate,
          taxable_amount: taxableTotal,
          total_gst: gstTotal,
          grand_total: grandTotal,
          payment_status: paymentStatus
        },
        items: items
      };

      try {
        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to save purchase");

        // Handle attachment file upload if selected
        const fileInput = document.getElementById("pur-file");
        if (fileInput && fileInput.files.length > 0) {
          await uploadAttachment(fileInput.files[0], "Purchase", purchaseNo);
        }

        purchaseModal.classList.remove("active");
        fetchPurchases();
      } catch (err) {
        alert("Error saving purchase: " + err.message);
      }
    });
  }

  async function handleDeletePurchase(id) {
    if (!confirm(`Are you sure you want to delete purchase record ${id}? This will also reverse the stock increments.`)) return;
    try {
      const res = await fetch(`/api/purchases?id=${id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to delete purchase");
      fetchPurchases();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function fetchPurchases() {
    try {
      const res = await fetch("/api/purchases");
      if (!res.ok) throw new Error("Failed to load purchases");
      const list = await res.json();

      const tbody = document.getElementById("purchases-list");
      const emptyMsg = document.getElementById("purchases-empty");
      if (!tbody) return;

      tbody.innerHTML = "";

      if (list.length === 0) {
        emptyMsg.style.display = "block";
      } else {
        emptyMsg.style.display = "none";
        list.forEach(pur => {
          const tr = document.createElement("tr");

          const tdNo = document.createElement("td");
          tdNo.textContent = pur.id;
          tr.appendChild(tdNo);

          const tdDate = document.createElement("td");
          tdDate.textContent = pur.invoice_date;
          tr.appendChild(tdDate);

          const tdSup = document.createElement("td");
          tdSup.textContent = pur.supplier_name || "UNKNOWN VENDOR";
          tr.appendChild(tdSup);

          const tdSupInv = document.createElement("td");
          tdSupInv.textContent = pur.supplier_invoice_number || "—";
          tr.appendChild(tdSupInv);

          const tdTaxable = document.createElement("td");
          tdTaxable.textContent = `₹${parseFloat(pur.taxable_amount).toFixed(2)}`;
          tr.appendChild(tdTaxable);

          const tdGst = document.createElement("td");
          tdGst.textContent = `₹${parseFloat(pur.total_gst).toFixed(2)}`;
          tr.appendChild(tdGst);

          const tdTotal = document.createElement("td");
          tdTotal.textContent = `₹${parseFloat(pur.grand_total).toFixed(2)}`;
          tr.appendChild(tdTotal);

          const tdStatus = document.createElement("td");
          tdStatus.textContent = pur.payment_status.toUpperCase();
          tr.appendChild(tdStatus);

          const tdFile = document.createElement("td");
          if (pur.attachment_path) {
            const a = document.createElement("a");
            a.href = pur.attachment_path;
            a.target = "_blank";
            a.textContent = "📄 VIEW BILL";
            a.style.color = "#fc5000";
            a.style.fontWeight = "bold";
            tdFile.appendChild(a);
          } else {
            tdFile.textContent = "—";
          }
          tr.appendChild(tdFile);

          const tdActions = document.createElement("td");
          const btnDel = document.createElement("button");
          btnDel.className = "btn-small delete";
          btnDel.textContent = "DELETE";
          btnDel.addEventListener("click", () => handleDeletePurchase(pur.id));
          tdActions.appendChild(btnDel);
          tr.appendChild(tdActions);

          tbody.appendChild(tr);
        });
        initializeTableControls("purchases-list");
      }
    } catch (err) {
      console.error("Fetch purchases error:", err);
    }
  }

  // --- Expenses Editor ---
  const expenseModal = document.getElementById("expense-modal");
  const expenseForm = document.getElementById("expense-form");
  const btnCancelExpense = document.getElementById("btn-cancel-expense");
  const btnCreateExpense = document.getElementById("btn-create-expense");

  if (btnCreateExpense) {
    btnCreateExpense.addEventListener("click", () => {
      document.getElementById("exp-category").value = "Miscellaneous";
      document.getElementById("exp-date").value = new Date().toISOString().split("T")[0];
      document.getElementById("exp-amount").value = "";
      document.getElementById("exp-gst-rate").value = "0";
      document.getElementById("exp-payment-method").value = "UPI";
      document.getElementById("exp-ref-no").value = "";
      document.getElementById("exp-notes").value = "";
      document.getElementById("exp-file").value = "";
      expenseModal.classList.add("active");
    });
  }

  if (btnCancelExpense) {
    btnCancelExpense.addEventListener("click", () => {
      expenseModal.classList.remove("active");
    });
  }

  if (expenseForm) {
    expenseForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const amount = parseFloat(document.getElementById("exp-amount").value);
      const gstRate = parseFloat(document.getElementById("exp-gst-rate").value);
      
      // Calculate inline GST paid
      let gstAmount = 0;
      if (gstRate > 0) {
        // GST = Amount - (Amount / (1 + Rate/100))
        gstAmount = amount - (amount / (1 + gstRate / 100));
      }

      const payload = {
        category: document.getElementById("exp-category").value,
        amount: amount,
        gst_amount: gstAmount,
        expense_date: document.getElementById("exp-date").value,
        payment_method: document.getElementById("exp-payment-method").value,
        reference_number: document.getElementById("exp-ref-no").value.trim(),
        notes: document.getElementById("exp-notes").value.trim()
      };

      try {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to record expense");

        const expenseId = result.id;

        // Handle attachment file upload if selected
        const fileInput = document.getElementById("exp-file");
        if (fileInput && fileInput.files.length > 0) {
          await uploadAttachment(fileInput.files[0], "Expense", String(expenseId));
        }

        expenseModal.classList.remove("active");
        fetchExpenses();
      } catch (err) {
        alert("Error saving expense: " + err.message);
      }
    });
  }

  async function handleDeleteExpense(id) {
    if (!confirm(`Are you sure you want to delete expense record #${id}?`)) return;
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to delete expense");
      fetchExpenses();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function fetchExpenses() {
    try {
      const res = await fetch("/api/expenses");
      if (!res.ok) throw new Error("Failed to load expenses");
      const list = await res.json();

      const tbody = document.getElementById("expenses-list");
      const emptyMsg = document.getElementById("expenses-empty");
      if (!tbody) return;

      tbody.innerHTML = "";

      if (list.length === 0) {
        emptyMsg.style.display = "block";
      } else {
        emptyMsg.style.display = "none";
        list.forEach(exp => {
          const tr = document.createElement("tr");

          const tdId = document.createElement("td");
          tdId.textContent = `#${exp.id}`;
          tr.appendChild(tdId);

          const tdDate = document.createElement("td");
          tdDate.textContent = exp.expense_date;
          tr.appendChild(tdDate);

          const tdCat = document.createElement("td");
          tdCat.textContent = exp.category.toUpperCase();
          tdCat.style.fontWeight = "bold";
          tr.appendChild(tdCat);

          const tdAmount = document.createElement("td");
          tdAmount.textContent = `₹${parseFloat(exp.amount).toFixed(2)}`;
          tr.appendChild(tdAmount);

          const tdGst = document.createElement("td");
          tdGst.textContent = `₹${parseFloat(exp.gst_amount || 0).toFixed(2)}`;
          tr.appendChild(tdGst);

          const tdMode = document.createElement("td");
          tdMode.textContent = exp.payment_method.toUpperCase();
          tr.appendChild(tdMode);

          const tdRef = document.createElement("td");
          tdRef.textContent = exp.reference_number || "—";
          tr.appendChild(tdRef);

          const tdNotes = document.createElement("td");
          tdNotes.textContent = exp.notes || "—";
          tr.appendChild(tdNotes);

          const tdFile = document.createElement("td");
          if (exp.attachment_path) {
            const a = document.createElement("a");
            a.href = exp.attachment_path;
            a.target = "_blank";
            a.textContent = "📄 VIEW RECEIPT";
            a.style.color = "#fc5000";
            a.style.fontWeight = "bold";
            tdFile.appendChild(a);
          } else {
            tdFile.textContent = "—";
          }
          tr.appendChild(tdFile);

          const tdActions = document.createElement("td");
          const btnDel = document.createElement("button");
          btnDel.className = "btn-small delete";
          btnDel.textContent = "DELETE";
          btnDel.addEventListener("click", () => handleDeleteExpense(exp.id));
          tdActions.appendChild(btnDel);
          tr.appendChild(tdActions);

          tbody.appendChild(tr);
        });
        initializeTableControls("expenses-list");
      }
    } catch (err) {
      console.error("Fetch expenses error:", err);
    }
  }

  async function uploadAttachment(file, entityType, entityId) {
    if (!file) return null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entity_type", entityType);
    formData.append("entity_id", entityId);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to upload file");
    }
    const result = await res.json();
    return result.file_path;
  }

  // Pre-load data caches
  loadSuppliersDropdown();

  // Close modals on Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (supplierModal) supplierModal.classList.remove("active");
      if (purchaseModal) purchaseModal.classList.remove("active");
      if (expenseModal) expenseModal.classList.remove("active");
    }
  });
  // ==========================================
  // --- 10. GST REPORTS & FINANCIAL CHARTS ---
  // ==========================================

  async function fetchDashboardMetrics() {
    try {
      const res = await fetch("/api/dashboard/metrics");
      if (!res.ok) throw new Error("Failed to load dashboard metrics");
      const metrics = await res.json();

      // Update monthly overview widgets
      document.getElementById("stat-sales").textContent = `₹${parseFloat(metrics.monthlySales).toFixed(2)}`;
      document.getElementById("stat-expenses").textContent = `₹${parseFloat(metrics.monthlyExpenses).toFixed(2)}`;

      // Update Net Profit Card
      const profitValNode = document.getElementById("stat-profit");
      if (profitValNode) {
        profitValNode.textContent = `₹${parseFloat(metrics.netProfit).toFixed(2)}`;
        if (metrics.netProfit > 0) {
          profitValNode.style.color = "green";
        } else if (metrics.netProfit < 0) {
          profitValNode.style.color = "var(--color-ember)";
        } else {
          profitValNode.style.color = "inherit";
        }
      }

      // Update Profit Margin Card
      const marginValNode = document.getElementById("stat-margin");
      if (marginValNode) {
        marginValNode.textContent = `${parseFloat(metrics.profitMargin).toFixed(1)}%`;
        if (metrics.profitMargin > 0) {
          marginValNode.style.color = "green";
        } else if (metrics.profitMargin < 0) {
          marginValNode.style.color = "var(--color-ember)";
        } else {
          marginValNode.style.color = "inherit";
        }
      }
      
      // Calculate output tax vs input tax credit for the current month
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const repRes = await fetch(`/api/reports/gst?month=${thisMonth}`);
      if (repRes.ok) {
        const report = await repRes.json();
        const netGst = report.gstr3b.net_cgst + report.gstr3b.net_sgst + report.gstr3b.net_igst;
        const gstValNode = document.getElementById("stat-gst");
        if (gstValNode) {
          if (netGst > 0) {
            gstValNode.textContent = `₹${netGst.toFixed(2)}`;
            gstValNode.style.color = "var(--color-ember)";
          } else if (netGst < 0) {
            gstValNode.textContent = `₹${Math.abs(netGst).toFixed(2)} (Credit)`;
            gstValNode.style.color = "green";
          } else {
            gstValNode.textContent = `₹0.00`;
            gstValNode.style.color = "inherit";
          }
        }
      }

      const outstandingValNode = document.getElementById("stat-outstanding");
      if (outstandingValNode) {
        outstandingValNode.textContent = `₹${parseFloat(metrics.receivables).toFixed(2)}`;
        if (metrics.receivables > 0) {
          outstandingValNode.style.color = "var(--color-ember)";
        } else {
          outstandingValNode.style.color = "green";
        }
      }

      // Populate Recent Invoices Table
      const recentList = document.getElementById("dash-recent-invoices-list");
      if (recentList) {
        recentList.innerHTML = "";
        if (!metrics.recentInvoices || metrics.recentInvoices.length === 0) {
          recentList.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #777;">NO RECENT INVOICES</td></tr>`;
        } else {
          metrics.recentInvoices.forEach(inv => {
            let statusBadgeHtml = "";
            if (inv.status === "Paid") {
              statusBadgeHtml = `<span style="color: green; font-weight: bold;">Paid</span>`;
            } else if (inv.status === "Partially Paid") {
              statusBadgeHtml = `<span style="color: orange; font-weight: bold;">Partially Paid</span>`;
            } else {
              statusBadgeHtml = `<span style="color: red; font-weight: bold;">Unpaid</span>`;
            }
            recentList.innerHTML += `
              <tr>
                <td><strong>${inv.invoice_number}</strong></td>
                <td>${inv.invoice_date}</td>
                <td>${inv.customer_name || "Consumer"}</td>
                <td><strong>₹${parseFloat(inv.grand_total).toFixed(2)}</strong></td>
                <td>${statusBadgeHtml}</td>
              </tr>
            `;
          });
        }
      }

      // Populate Top Products volume list
      const topProductsContainer = document.getElementById("dash-top-products-container");
      if (topProductsContainer) {
        topProductsContainer.innerHTML = "";
        if (!metrics.topProducts || metrics.topProducts.length === 0) {
          topProductsContainer.innerHTML = `<div style="text-align: center; color: #777;">NO SALES RECORDED THIS MONTH</div>`;
        } else {
          const maxQty = Math.max(...metrics.topProducts.map(p => p.total_qty || 1.0));
          metrics.topProducts.forEach((p, idx) => {
            const pct = maxQty > 0 ? ((p.total_qty / maxQty) * 100).toFixed(1) : "0.0";
            const colors = ["#fc5000", "#070607", "#7f7f7f"];
            const color = colors[idx % colors.length];
            topProductsContainer.innerHTML += `
              <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 11px;">
                  <strong>${p.name}</strong>
                  <span>${p.total_qty} units</span>
                </div>
                <div style="background-color: #e0e0e0; height: 6px; border-radius: 3px; overflow: hidden;">
                  <div style="background-color: ${color}; width: ${pct}%; height: 100%;"></div>
                </div>
              </div>
            `;
          });
        }
      }

      // Render charts
      renderTrendChart(metrics.trend);
      renderDistributionChart(metrics.expensesDistribution);

    } catch (err) {
      console.error("Fetch dashboard metrics error:", err);
    }
  }

  function renderTrendChart(trendData) {
    const container = document.getElementById("trend-chart-container");
    if (!container) return;

    if (!trendData || trendData.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #777; padding-top: 50px;">NO TREND DATA AVAILABLE</div>`;
      return;
    }

    const width = 500;
    const height = 200;
    const paddingLeft = 55;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const maxVal = Math.max(...trendData.map(d => Math.max(d.sales, d.expenses, 1000)));

    const getX = (index) => paddingLeft + (index / (trendData.length - 1)) * (width - paddingLeft - paddingRight);
    const getY = (val) => height - paddingBottom - (val / maxVal) * (height - paddingTop - paddingBottom);

    let salesPoints = "";
    let expensePoints = "";
    trendData.forEach((d, idx) => {
      const x = getX(idx);
      salesPoints += `${x},${getY(d.sales)} `;
      expensePoints += `${x},${getY(d.expenses)} `;
    });

    let gridLines = "";
    let labels = "";
    
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const val = (maxVal / gridSteps) * i;
      const y = getY(val);
      gridLines += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="#e0e0e0" stroke-dasharray="2,2" />`;
      labels += `<text x="${paddingLeft - 8}" y="${y + 4}" font-size="8" text-anchor="end" fill="#777">₹${Math.round(val)}</text>`;
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    trendData.forEach((d, idx) => {
      const x = getX(idx);
      const parts = d.month.split("-");
      const monthIndex = parseInt(parts[1], 10) - 1;
      const monthName = monthNames[monthIndex] || parts[1];
      labels += `<text x="${x}" y="${height - 8}" font-size="8" text-anchor="middle" fill="#777">${monthName}</text>`;
    });

    const svgHtml = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="display: block;">
        ${gridLines}
        <polyline fill="none" stroke="var(--color-ember)" stroke-width="2.5" points="${salesPoints.trim()}" />
        ${trendData.map((d, idx) => `<circle cx="${getX(idx)}" cy="${getY(d.sales)}" r="3.5" fill="var(--color-ember)" />`).join("")}
        <polyline fill="none" stroke="var(--color-obsidian)" stroke-width="2" stroke-dasharray="3,2" points="${expensePoints.trim()}" />
        ${trendData.map((d, idx) => `<circle cx="${getX(idx)}" cy="${getY(d.expenses)}" r="3" fill="var(--color-obsidian)" />`).join("")}
        ${labels}
      </svg>
    `;

    container.innerHTML = svgHtml;
  }

  function renderDistributionChart(data) {
    const container = document.getElementById("distribution-chart-container");
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #777; width: 100%;">NO EXPENSE DATA IN THIS PERIOD</div>`;
      return;
    }

    const total = data.reduce((sum, d) => sum + d.total, 0);
    
    let listHtml = '<div style="display: flex; flex-direction: column; gap: 8px; width: 100%; font-size: 11px;">';
    const colors = ["#fc5000", "#070607", "#7f7f7f", "#bfbfbf", "#df5f00", "#404040", "#a63c00", "#1f1f1f", "#d97036", "#595959"];
    
    data.forEach((d, idx) => {
      const pct = total > 0 ? ((d.total / total) * 100).toFixed(1) : "0.0";
      const color = colors[idx % colors.length];
      listHtml += `
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <strong>${d.category.toUpperCase()} (${pct}%)</strong>
            <span>₹${parseFloat(d.total).toFixed(2)}</span>
          </div>
          <div style="background-color: #e0e0e0; height: 6px; border-radius: 3px; overflow: hidden;">
            <div style="background-color: ${color}; width: ${pct}%; height: 100%;"></div>
          </div>
        </div>
      `;
    });
    listHtml += '</div>';

    container.innerHTML = listHtml;
  }

  // Reports month selector handler
  const reportMonthSelect = document.getElementById("report-month-select");
  if (reportMonthSelect) {
    reportMonthSelect.value = new Date().toISOString().substring(0, 7);
    reportMonthSelect.addEventListener("change", () => {
      fetchGstReport();
      fetchFilingRegisters();
    });
  }

  // Report subtabs navigation
  const subTabButtons = document.querySelectorAll(".sub-tab-btn");
  const subTabContents = document.querySelectorAll(".report-subtab-content");

  subTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      subTabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const targetSubtab = btn.getAttribute("data-subtab");
      subTabContents.forEach(content => {
        if (content.id === targetSubtab) {
          content.style.display = "block";
        } else {
          content.style.display = "none";
        }
      });
    });
  });

  async function fetchGstReport() {
    let url = "/api/reports/gst";
    const typeSelect = document.getElementById("export-period-type");
    const periodType = typeSelect ? typeSelect.value : "month";

    if (periodType === "month") {
      const monthVal = reportMonthSelect ? reportMonthSelect.value : new Date().toISOString().substring(0, 7);
      url += `?month=${monthVal}`;
    } else if (periodType === "quarter") {
      const quarterSelect = document.getElementById("export-quarter-select");
      const quarterVal = quarterSelect ? quarterSelect.value : "2026-Q1";
      url += `?quarter=${quarterVal}`;
    } else if (periodType === "custom") {
      const fromInput = document.getElementById("export-from-date");
      const toInput = document.getElementById("export-to-date");
      const fromVal = fromInput ? fromInput.value : "";
      const toVal = toInput ? toInput.value : "";
      if (fromVal && toVal) {
        url += `?from=${fromVal}&to=${toVal}`;
      } else {
        const monthVal = reportMonthSelect ? reportMonthSelect.value : new Date().toISOString().substring(0, 7);
        url += `?month=${monthVal}`;
      }
    }
    clearReportErrorAlert();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load GST reports");
      const report = await res.json();

      // 1. Populate GSTR-1 B2B
      const b2bTbody = document.getElementById("rep-gstr1-b2b-list");
      if (b2bTbody) {
        b2bTbody.innerHTML = "";
        if (report.gstr1b2b.length === 0) {
          b2bTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #777;">NO B2B TAXABLE SUPPLIES RECORDED</td></tr>';
        } else {
          report.gstr1b2b.forEach(inv => {
            b2bTbody.innerHTML += `
              <tr>
                <td>${inv.invoice_number}</td>
                <td>${inv.invoice_date}</td>
                <td>${inv.customer_name}</td>
                <td>${inv.customer_gstin}</td>
                <td>₹${parseFloat(inv.taxable_amount).toFixed(2)}</td>
                <td>₹${parseFloat(inv.total_cgst).toFixed(2)}</td>
                <td>₹${parseFloat(inv.total_sgst).toFixed(2)}</td>
                <td>₹${parseFloat(inv.total_igst).toFixed(2)}</td>
                <td>₹${parseFloat(inv.grand_total).toFixed(2)}</td>
              </tr>
            `;
          });
        }
      }

      // 2. Populate GSTR-1 B2C
      const b2cTbody = document.getElementById("rep-gstr1-b2c-list");
      if (b2cTbody) {
        b2cTbody.innerHTML = "";
        if (report.gstr1b2c.length === 0) {
          b2cTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #777;">NO B2C SUPPLIES RECORDED</td></tr>';
        } else {
          report.gstr1b2c.forEach(inv => {
            b2cTbody.innerHTML += `
              <tr>
                <td>${inv.invoice_number}</td>
                <td>${inv.invoice_date}</td>
                <td>${inv.customer_name}</td>
                <td>₹${parseFloat(inv.taxable_amount).toFixed(2)}</td>
                <td>₹${parseFloat(inv.total_cgst).toFixed(2)}</td>
                <td>₹${parseFloat(inv.total_sgst).toFixed(2)}</td>
                <td>₹${parseFloat(inv.total_igst).toFixed(2)}</td>
                <td>₹${parseFloat(inv.grand_total).toFixed(2)}</td>
              </tr>
            `;
          });
        }
      }

      // 3. Populate GSTR-1 HSN
      const hsnTbody = document.getElementById("rep-gstr1-hsn-list");
      if (hsnTbody) {
        hsnTbody.innerHTML = "";
        if (report.gstr1hsn.length === 0) {
          hsnTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #777;">NO HSN-WISE RECORDED OUTWARD DATA</td></tr>';
        } else {
          report.gstr1hsn.forEach(hsn => {
            hsnTbody.innerHTML += `
              <tr>
                <td>${hsn.hsn_sac_code}</td>
                <td>${hsn.total_qty}</td>
                <td>₹${parseFloat(hsn.total_taxable).toFixed(2)}</td>
                <td>₹${parseFloat(hsn.total_cgst).toFixed(2)}</td>
                <td>₹${parseFloat(hsn.total_sgst).toFixed(2)}</td>
                <td>₹${parseFloat(hsn.total_igst).toFixed(2)}</td>
                <td>₹${parseFloat(hsn.total_amount).toFixed(2)}</td>
              </tr>
            `;
          });
        }
      }

      // 4. Populate GSTR-3B Table 3.1
      const t3 = report.gstr3bDetails.table3_1;
      document.getElementById("rep-3b-31a-txval").textContent = `₹${parseFloat(t3.a.txval).toFixed(2)}`;
      document.getElementById("rep-3b-31a-igst").textContent = `₹${parseFloat(t3.a.igst).toFixed(2)}`;
      document.getElementById("rep-3b-31a-cgst").textContent = `₹${parseFloat(t3.a.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-31a-sgst").textContent = `₹${parseFloat(t3.a.sgst).toFixed(2)}`;

      document.getElementById("rep-3b-31b-txval").textContent = `₹${parseFloat(t3.b.txval).toFixed(2)}`;
      document.getElementById("rep-3b-31b-igst").textContent = `₹${parseFloat(t3.b.igst).toFixed(2)}`;

      document.getElementById("rep-3b-31c-txval").textContent = `₹${parseFloat(t3.c.txval).toFixed(2)}`;

      document.getElementById("rep-3b-31d-txval").textContent = `₹${parseFloat(t3.d.txval).toFixed(2)}`;
      document.getElementById("rep-3b-31d-igst").textContent = `₹${parseFloat(t3.d.igst).toFixed(2)}`;
      document.getElementById("rep-3b-31d-cgst").textContent = `₹${parseFloat(t3.d.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-31d-sgst").textContent = `₹${parseFloat(t3.d.sgst).toFixed(2)}`;

      document.getElementById("rep-3b-31e-txval").textContent = `₹${parseFloat(t3.e.txval).toFixed(2)}`;

      // 5. Populate GSTR-3B Table 4 Eligible ITC
      const t4 = report.gstr3bDetails.table4;
      document.getElementById("rep-3b-4a1-igst").textContent = `₹${parseFloat(t4.importGoods.igst).toFixed(2)}`;
      document.getElementById("rep-3b-4a2-igst").textContent = `₹${parseFloat(t4.importServices.igst).toFixed(2)}`;
      
      document.getElementById("rep-3b-4a3-igst").textContent = `₹${parseFloat(t4.inwardRC.igst).toFixed(2)}`;
      document.getElementById("rep-3b-4a3-cgst").textContent = `₹${parseFloat(t4.inwardRC.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-4a3-sgst").textContent = `₹${parseFloat(t4.inwardRC.sgst).toFixed(2)}`;

      document.getElementById("rep-3b-4a4-igst").textContent = `₹${parseFloat(t4.isd.igst).toFixed(2)}`;
      document.getElementById("rep-3b-4a4-cgst").textContent = `₹${parseFloat(t4.isd.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-4a4-sgst").textContent = `₹${parseFloat(t4.isd.sgst).toFixed(2)}`;

      document.getElementById("rep-3b-4a5-igst").textContent = `₹${parseFloat(t4.allOtherItc.igst).toFixed(2)}`;
      document.getElementById("rep-3b-4a5-cgst").textContent = `₹${parseFloat(t4.allOtherItc.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-4a5-sgst").textContent = `₹${parseFloat(t4.allOtherItc.sgst).toFixed(2)}`;

      document.getElementById("rep-3b-4b-igst").textContent = `₹${parseFloat(t4.reversals.igst).toFixed(2)}`;
      document.getElementById("rep-3b-4b-cgst").textContent = `₹${parseFloat(t4.reversals.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-4b-sgst").textContent = `₹${parseFloat(t4.reversals.sgst).toFixed(2)}`;

      document.getElementById("rep-3b-4c-igst").textContent = `₹${parseFloat(t4.netItc.igst).toFixed(2)}`;
      document.getElementById("rep-3b-4c-cgst").textContent = `₹${parseFloat(t4.netItc.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-4c-sgst").textContent = `₹${parseFloat(t4.netItc.sgst).toFixed(2)}`;

      document.getElementById("rep-3b-4d1-cgst").textContent = `₹${parseFloat(t4.blocked.cgst).toFixed(2)}`;
      document.getElementById("rep-3b-4d1-sgst").textContent = `₹${parseFloat(t4.blocked.sgst).toFixed(2)}`;

      // 6. Populate Net Tax Payables Summary
      const liab = report.gstr3bDetails.liability;
      document.getElementById("rep-net-out-cgst").textContent = `₹${parseFloat(liab.output.cgst).toFixed(2)}`;
      document.getElementById("rep-net-itc-cgst").textContent = `₹${parseFloat(liab.itc.cgst).toFixed(2)}`;
      formatNetPayable(document.getElementById("rep-net-pay-cgst"), liab.netPayable.cgst);

      document.getElementById("rep-net-out-sgst").textContent = `₹${parseFloat(liab.output.sgst).toFixed(2)}`;
      document.getElementById("rep-net-itc-sgst").textContent = `₹${parseFloat(liab.itc.sgst).toFixed(2)}`;
      formatNetPayable(document.getElementById("rep-net-pay-sgst"), liab.netPayable.sgst);

      document.getElementById("rep-net-out-igst").textContent = `₹${parseFloat(liab.output.igst).toFixed(2)}`;
      document.getElementById("rep-net-itc-igst").textContent = `₹${parseFloat(liab.itc.igst).toFixed(2)}`;
      formatNetPayable(document.getElementById("rep-net-pay-igst"), liab.netPayable.igst);

      // Populate ITC Offset subtraction widget
      const totalOutputGst = liab.output.cgst + liab.output.sgst + liab.output.igst;
      const totalInputGst = liab.itc.cgst + liab.itc.sgst + liab.itc.igst;
      const netGstPayableOrCredit = totalOutputGst - totalInputGst;

      document.getElementById("itc-offset-output").textContent = `₹${totalOutputGst.toFixed(2)}`;
      document.getElementById("itc-offset-input").textContent = `- ₹${totalInputGst.toFixed(2)}`;

      const netNode = document.getElementById("itc-offset-net");
      const descNode = document.getElementById("itc-offset-desc");
      const wrapNode = document.getElementById("itc-offset-net-wrap");

      if (netNode && descNode && wrapNode) {
        if (netGstPayableOrCredit > 0) {
          netNode.textContent = `₹${netGstPayableOrCredit.toFixed(2)} to Pay`;
          netNode.style.color = "var(--color-ember)";
          descNode.textContent = "Balance GST to pay after supplier tax offset";
          wrapNode.style.backgroundColor = "transparent";
        } else if (netGstPayableOrCredit < 0) {
          netNode.textContent = `₹${Math.abs(netGstPayableOrCredit).toFixed(2)} Credit`;
          netNode.style.color = "green";
          descNode.textContent = "Carry-forward refund credit to next filing";
          wrapNode.style.backgroundColor = "#e6f4ea"; // Light green highlight!
        } else {
          netNode.textContent = `₹0.00`;
          netNode.style.color = "inherit";
          descNode.textContent = "Balanced output liability and input tax credits";
          wrapNode.style.backgroundColor = "transparent";
        }
      }

      // 7. Interest & Late Fees details card
      document.getElementById("rep-due-date").textContent = liab.dueDate;
      document.getElementById("rep-days-late").textContent = `${liab.daysLate} days`;
      document.getElementById("rep-late-fee").textContent = `₹${parseFloat(liab.lateFee).toFixed(2)}`;
      document.getElementById("rep-interest").textContent = `₹${parseFloat(liab.interest).toFixed(2)}`;
      document.getElementById("rep-total-liability").textContent = `₹${parseFloat(liab.totalPayable).toFixed(2)}`;
    } catch (err) {
      console.error("Fetch GST Report error:", err);
      showReportErrorAlert("GST Aggregator Core Failure", err.message);
    }
  }

  function formatNetPayable(element, val) {
    if (!element) return;
    if (val > 0) {
      element.textContent = `₹${val.toFixed(2)}`;
      element.style.color = "var(--color-ember)";
    } else if (val < 0) {
      element.textContent = `₹${Math.abs(val).toFixed(2)} (Credit)`;
      element.style.color = "green";
    } else {
      element.textContent = `₹0.00`;
      element.style.color = "inherit";
    }
  }

  function showReportErrorAlert(title, message) {
    const container = document.getElementById("tab-reports");
    if (!container) return;

    let alertBox = document.getElementById("reports-error-boundary-alert");
    if (!alertBox) {
      alertBox = document.createElement("div");
      alertBox.id = "reports-error-boundary-alert";
      alertBox.style.backgroundColor = "#fce8e6";
      alertBox.style.border = "2px solid red";
      alertBox.style.color = "#c5221f";
      alertBox.style.padding = "16px";
      alertBox.style.borderRadius = "8px";
      alertBox.style.marginBottom = "24px";
      alertBox.style.fontSize = "13px";
      
      const header = document.querySelector("#tab-reports .screen-header");
      if (header) {
        header.parentNode.insertBefore(alertBox, header.nextSibling);
      }
    }
    
    alertBox.innerHTML = `
      <strong style="text-transform: uppercase;">⚠️ CRITICAL REPORTING ERROR: ${title}</strong>
      <p style="margin-top: 8px; margin-bottom: 8px;">The system failed to safely aggregate your tax registers. <strong>Do NOT use the values shown below for GST filing!</strong></p>
      <code>Details: ${message}</code>
      <br>
      <button class="btn btn-secondary-pill" style="margin-top: 12px; padding: 4px 12px; font-size: 11px; background: red; color: white; border: none; cursor: pointer;" onclick="window.location.reload()">RELOAD SYSTEM</button>
    `;

    const selectors = [
      "rep-3b-31a-txval", "rep-3b-31a-igst", "rep-3b-31a-cgst", "rep-3b-31a-sgst",
      "rep-3b-31b-txval", "rep-3b-31b-igst", "rep-3b-31c-txval", "rep-3b-31d-txval",
      "rep-3b-31d-igst", "rep-3b-31d-cgst", "rep-3b-31d-sgst", "rep-3b-31e-txval",
      "rep-3b-4a1-igst", "rep-3b-4a2-igst", "rep-3b-4a3-igst", "rep-3b-4a3-cgst",
      "rep-3b-4a3-sgst", "rep-3b-4a4-igst", "rep-3b-4a4-cgst", "rep-3b-4a4-sgst",
      "rep-3b-4a5-igst", "rep-3b-4a5-cgst", "rep-3b-4a5-sgst", "rep-3b-4b-igst",
      "rep-3b-4b-cgst", "rep-3b-4b-sgst", "rep-3b-4c-igst", "rep-3b-4c-cgst",
      "rep-3b-4c-sgst", "rep-3b-4d1-cgst", "rep-3b-4d1-sgst",
      "rep-net-out-cgst", "rep-net-itc-cgst", "rep-net-pay-cgst",
      "rep-net-out-sgst", "rep-net-itc-sgst", "rep-net-pay-sgst",
      "rep-net-out-igst", "rep-net-itc-igst", "rep-net-pay-igst",
      "rep-total-liability", "rep-late-fee", "rep-interest"
    ];

    selectors.forEach(id => {
      const node = document.getElementById(id);
      if (node) {
        node.textContent = "⚠️ ERROR";
        node.style.color = "red";
      }
    });

    const lists = ["rep-gstr1-b2b-list", "rep-gstr1-b2c-list", "rep-gstr1-hsn-list"];
    lists.forEach(id => {
      const node = document.getElementById(id);
      if (node) {
        node.innerHTML = '<tr><td colspan="20" style="text-align: center; color: red; font-weight: bold;">⚠️ ERROR LOADING REGISTER DATA</td></tr>';
      }
    });
  }

  function clearReportErrorAlert() {
    const alertBox = document.getElementById("reports-error-boundary-alert");
    if (alertBox) {
      alertBox.remove();
    }
    const selectors = [
      "rep-net-pay-cgst", "rep-net-pay-sgst", "rep-net-pay-igst", "rep-total-liability"
    ];
    selectors.forEach(id => {
      const node = document.getElementById(id);
      if (node) node.style.color = "";
    });
  }

  async function fetchPaymentsLedger() {
    try {
      const res = await fetch("/api/payments/ledger");
      if (!res.ok) throw new Error("Failed to load payments ledger");
      const ledger = await res.json();

      const tbody = document.getElementById("rep-ledger-list");
      if (!tbody) return;

      tbody.innerHTML = "";
      if (ledger.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #777;">NO TRANSACTION ENTRIES RECORDED</td></tr>';
      } else {
        ledger.forEach(p => {
          const tr = document.createElement("tr");

          const tdId = document.createElement("td");
          tdId.textContent = `#TXN-${p.id}`;
          tr.appendChild(tdId);

          const tdDate = document.createElement("td");
          tdDate.textContent = p.payment_date;
          tr.appendChild(tdDate);

          const tdDir = document.createElement("td");
          tdDir.textContent = p.direction;
          tdDir.style.fontWeight = "bold";
          if (p.direction === "IN") {
            tdDir.style.color = "green";
          } else {
            tdDir.style.color = "var(--color-ember)";
          }
          tr.appendChild(tdDir);

          const tdParty = document.createElement("td");
          tdParty.textContent = p.party_name;
          tr.appendChild(tdParty);

          const tdInv = document.createElement("td");
          tdInv.textContent = p.invoice_number || "—";
          tr.appendChild(tdInv);

          const tdMethod = document.createElement("td");
          tdMethod.textContent = p.payment_method;
          tr.appendChild(tdMethod);

          const tdRef = document.createElement("td");
          tdRef.textContent = p.reference_number || "—";
          tr.appendChild(tdRef);

          const tdAmount = document.createElement("td");
          tdAmount.textContent = `₹${parseFloat(p.amount).toFixed(2)}`;
          tdAmount.style.fontWeight = "bold";
          tr.appendChild(tdAmount);

          const tdNotes = document.createElement("td");
          tdNotes.textContent = p.notes || "—";
          tr.appendChild(tdNotes);

          tbody.appendChild(tr);
        });
        initializeTableControls("rep-ledger-list");
      }
    } catch (err) {
      console.error("Fetch payments ledger error:", err);
    }
  }

  // Restore backup handler
  const restoreBackupForm = document.getElementById("restore-backup-form");
  if (restoreBackupForm) {
    restoreBackupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById("restore-zip-input");
      if (!fileInput || fileInput.files.length === 0) {
        alert("Please select a backup .zip file to upload.");
        return;
      }

      if (!confirm("CRITICAL WARNING: Restoring from a backup package will OVERWRITE your current database and all attachments. This cannot be undone. Are you sure you want to continue?")) {
        return;
      }

      const formData = new FormData();
      formData.append("backup", fileInput.files[0]);

      try {
        const res = await fetch("/api/restore", {
          method: "POST",
          body: formData
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to restore backup archive");

        alert("Database and attachments successfully restored! The system will reload now.");
        window.location.reload();
      } catch (err) {
        alert("Restore Error: " + err.message);
      }
    });
  }

  // ==========================================
  // --- 11. GSTR-1 JSON PORTAL EXPORTER ---
  // ==========================================
  const exportPeriodType = document.getElementById("export-period-type");
  const exportMonthWrap = document.getElementById("export-month-wrap");
  const exportQuarterWrap = document.getElementById("export-quarter-wrap");
  const exportCustomWrap = document.getElementById("export-custom-wrap");

  const exportQuarterSelect = document.getElementById("export-quarter-select");
  const exportFromDate = document.getElementById("export-from-date");
  const exportToDate = document.getElementById("export-to-date");

  const btnExportGstr1Json = document.getElementById("btn-export-gstr1-json");
  const gstr1ValidationErrorBox = document.getElementById("gstr1-validation-error-box");
  const gstr1ValidationErrorsList = document.getElementById("gstr1-validation-errors-list");

  if (exportPeriodType) {
    const now = new Date();
    const currentMonthStr = now.toISOString().substring(0, 7);
    const reportMonthSelect = document.getElementById("report-month-select");
    if (reportMonthSelect) {
      reportMonthSelect.addEventListener("change", () => {
        fetchGstReport();
        fetchFilingRegisters();
      });
    }
    if (exportFromDate) {
      exportFromDate.value = `${currentMonthStr}-01`;
      exportFromDate.addEventListener("change", () => {
        fetchGstReport();
        fetchFilingRegisters();
      });
    }
    if (exportToDate) {
      exportToDate.value = now.toISOString().split("T")[0];
      exportToDate.addEventListener("change", () => {
        fetchGstReport();
        fetchFilingRegisters();
      });
    }
    if (exportQuarterSelect) {
      exportQuarterSelect.addEventListener("change", () => {
        fetchGstReport();
        fetchFilingRegisters();
      });
    }

    exportPeriodType.addEventListener("change", () => {
      const type = exportPeriodType.value;
      if (type === "month") {
        exportMonthWrap.style.display = "flex";
        exportQuarterWrap.style.display = "none";
        exportCustomWrap.style.display = "none";
      } else if (type === "quarter") {
        exportMonthWrap.style.display = "none";
        exportQuarterWrap.style.display = "flex";
        exportCustomWrap.style.display = "none";
      } else if (type === "custom") {
        exportMonthWrap.style.display = "none";
        exportQuarterWrap.style.display = "none";
        exportCustomWrap.style.display = "flex";
      }
      fetchGstReport();
      fetchFilingRegisters();
    });
  }

  if (btnExportGstr1Json) {
    btnExportGstr1Json.addEventListener("click", async () => {
      if (gstr1ValidationErrorBox) gstr1ValidationErrorBox.style.display = "none";
      if (gstr1ValidationErrorsList) gstr1ValidationErrorsList.innerHTML = "";

      let url = "/api/reports/gstr1-json";
      const type = exportPeriodType.value;
      let filename = "gstr1";

      if (type === "month") {
        const reportMonthSelect = document.getElementById("report-month-select");
        const val = reportMonthSelect ? reportMonthSelect.value : "";
        if (!val) {
          alert("Please select a month.");
          return;
        }
        url += `?month=${val}`;
        filename += `_${val.replace("-", "")}`;
      } else if (type === "quarter") {
        const val = exportQuarterSelect.value;
        url += `?quarter=${val}`;
        filename += `_${val.replace("-", "_")}`;
      } else if (type === "custom") {
        const from = exportFromDate.value;
        const to = exportToDate.value;
        if (!from || !to) {
          alert("Please select both from and to dates.");
          return;
        }
        url += `?from=${from}&to=${to}`;
        filename += `_${from.replace(/-/g, "")}_to_${to.replace(/-/g, "")}`;
      }

      try {
        const res = await fetch(url);
        const result = await res.json();

        if (res.status === 422) {
          if (gstr1ValidationErrorBox && gstr1ValidationErrorsList) {
            gstr1ValidationErrorBox.style.display = "block";
            const errors = result.validationErrors || [result.error];
            errors.forEach(err => {
              const li = document.createElement("li");
              li.textContent = err;
              gstr1ValidationErrorsList.appendChild(li);
            });
            alert("Validation failed. Please review the errors listed at the top of the GSTR-1 panel.");
          }
          return;
        }

        if (!res.ok) {
          throw new Error(result.error || "Failed to generate GSTR-1 JSON.");
        }

        const jsonStr = JSON.stringify(result, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const downloadUrl = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `${filename}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

      } catch (err) {
        alert("Export Error: " + err.message);
      }
    });
  }

  async function fetchFilingRegisters() {
    let url = "/api/reports/registers";
    const typeSelect = document.getElementById("export-period-type");
    const periodType = typeSelect ? typeSelect.value : "month";

    if (periodType === "month") {
      const monthVal = reportMonthSelect ? reportMonthSelect.value : new Date().toISOString().substring(0, 7);
      url += `?month=${monthVal}`;
    } else if (periodType === "quarter") {
      const quarterSelect = document.getElementById("export-quarter-select");
      const quarterVal = quarterSelect ? quarterSelect.value : "2026-Q1";
      url += `?quarter=${quarterVal}`;
    } else if (periodType === "custom") {
      const fromInput = document.getElementById("export-from-date");
      const toInput = document.getElementById("export-to-date");
      const fromVal = fromInput ? fromInput.value : "";
      const toVal = toInput ? toInput.value : "";
      if (fromVal && toVal) {
        url += `?from=${fromVal}&to=${toVal}`;
      } else {
        const monthVal = reportMonthSelect ? reportMonthSelect.value : new Date().toISOString().substring(0, 7);
        url += `?month=${monthVal}`;
      }
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch tax registers");
      const data = await res.json();

      // 1. Populate Sales Register
      const salesBody = document.getElementById("reg-sales-list");
      if (salesBody) {
        salesBody.innerHTML = "";
        if (data.salesRegister.length === 0) {
          salesBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #777;">NO SALES RECORDED IN THIS PERIOD</td></tr>';
        } else {
          data.salesRegister.forEach(r => {
            salesBody.innerHTML += `
              <tr>
                <td><strong>${r.invoice_number}</strong></td>
                <td>${r.invoice_date}</td>
                <td>${r.customer_name || "Consumer"}</td>
                <td>${r.customer_gstin || "—"}</td>
                <td>₹${parseFloat(r.taxable_amount).toFixed(2)}</td>
                <td>₹${parseFloat(r.total_cgst).toFixed(2)}</td>
                <td>₹${parseFloat(r.total_sgst).toFixed(2)}</td>
                <td>₹${parseFloat(r.total_igst).toFixed(2)}</td>
                <td><strong>₹${parseFloat(r.grand_total).toFixed(2)}</strong></td>
              </tr>
            `;
          });
        }
      }

      // 2. Populate Purchase Register
      const purchaseBody = document.getElementById("reg-purchases-list");
      if (purchaseBody) {
        purchaseBody.innerHTML = "";
        if (data.purchaseRegister.length === 0) {
          purchaseBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #777;">NO PURCHASES RECORDED IN THIS PERIOD</td></tr>';
        } else {
          data.purchaseRegister.forEach(r => {
            purchaseBody.innerHTML += `
              <tr>
                <td><strong>${r.purchase_number}</strong></td>
                <td>${r.invoice_date}</td>
                <td>${r.supplier_name}</td>
                <td>${r.supplier_gstin || "—"}</td>
                <td>₹${parseFloat(r.taxable_amount).toFixed(2)}</td>
                <td>₹${parseFloat(r.total_gst).toFixed(2)}</td>
                <td><strong>₹${parseFloat(r.grand_total).toFixed(2)}</strong></td>
              </tr>
            `;
          });
        }
      }

      // 3. Populate State-wise Sales
      const stateBody = document.getElementById("reg-state-sales-list");
      if (stateBody) {
        stateBody.innerHTML = "";
        if (data.stateWiseSales.length === 0) {
          stateBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #777;">NO OUTWARD SUPPLIES</td></tr>';
        } else {
          data.stateWiseSales.forEach(r => {
            stateBody.innerHTML += `
              <tr>
                <td><strong>${r.state_name}</strong></td>
                <td>${r.state_code}</td>
                <td>${r.invoice_count}</td>
                <td>₹${parseFloat(r.total_taxable).toFixed(2)}</td>
                <td>₹${parseFloat(r.total_cgst).toFixed(2)}</td>
                <td>₹${parseFloat(r.total_sgst).toFixed(2)}</td>
                <td>₹${parseFloat(r.total_igst).toFixed(2)}</td>
                <td><strong>₹${parseFloat(r.total_value).toFixed(2)}</strong></td>
              </tr>
            `;
          });
        }
      }

      // 4A. GST Rate Sales
      const rateSalesBody = document.getElementById("reg-rate-sales-list");
      if (rateSalesBody) {
        rateSalesBody.innerHTML = "";
        if (data.rateSummarySales.length === 0) {
          rateSalesBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #777;">NO OUTWARD DATA</td></tr>';
        } else {
          data.rateSummarySales.forEach(r => {
            rateSalesBody.innerHTML += `
              <tr>
                <td><strong>${r.gst_rate}%</strong></td>
                <td>₹${parseFloat(r.sales_taxable).toFixed(2)}</td>
                <td>₹${(parseFloat(r.sales_cgst) + parseFloat(r.sales_sgst)).toFixed(2)}</td>
                <td>₹${parseFloat(r.sales_igst).toFixed(2)}</td>
              </tr>
            `;
          });
        }
      }

      // 4B. GST Rate Purchases
      const ratePurchasesBody = document.getElementById("reg-rate-purchases-list");
      if (ratePurchasesBody) {
        ratePurchasesBody.innerHTML = "";
        if (data.rateSummaryPurchases.length === 0) {
          ratePurchasesBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #777;">NO INWARD DATA</td></tr>';
        } else {
          data.rateSummaryPurchases.forEach(r => {
            ratePurchasesBody.innerHTML += `
              <tr>
                <td><strong>${r.gst_rate}%</strong></td>
                <td>₹${parseFloat(r.purchase_taxable).toFixed(2)}</td>
                <td>₹${(parseFloat(r.purchase_cgst) + parseFloat(r.purchase_sgst)).toFixed(2)}</td>
                <td>₹${parseFloat(r.purchase_igst).toFixed(2)}</td>
              </tr>
            `;
          });
        }
      }

      // 5. Populate Monthly Summary
      const monthlyBody = document.getElementById("reg-monthly-list");
      if (monthlyBody) {
        monthlyBody.innerHTML = "";
        data.monthlySummary.forEach(r => {
          const date = new Date(r.month + "-02");
          const monthName = date.toLocaleString("en-US", { month: "long", year: "numeric" });
          monthlyBody.innerHTML += `
            <tr>
              <td><strong>${monthName.toUpperCase()}</strong></td>
              <td>₹${parseFloat(r.salesTaxable).toFixed(2)}</td>
              <td>₹${parseFloat(r.salesGst).toFixed(2)}</td>
              <td>₹${parseFloat(r.purchaseTaxable).toFixed(2)}</td>
              <td>₹${parseFloat(r.purchaseGst).toFixed(2)}</td>
              <td>₹${parseFloat(r.expenseTaxable).toFixed(2)}</td>
              <td>₹${parseFloat(r.expenseGst).toFixed(2)}</td>
            </tr>
          `;
        });
      }

      // 6. Populate Quarterly Summary
      const quarterlyBody = document.getElementById("reg-quarterly-list");
      if (quarterlyBody) {
        quarterlyBody.innerHTML = "";
        data.quarterlySummary.forEach(r => {
          quarterlyBody.innerHTML += `
            <tr>
              <td><strong>${r.name}</strong></td>
              <td>₹${parseFloat(r.salesTaxable).toFixed(2)}</td>
              <td>₹${parseFloat(r.purchaseTaxable).toFixed(2)}</td>
              <td>₹${parseFloat(r.expenseTaxable).toFixed(2)}</td>
            </tr>
          `;
        });
      }

      // 7. Populate Annual Summary
      document.getElementById("reg-annual-sales-tx").textContent = `₹${parseFloat(data.annualSummary.salesTaxable).toFixed(2)}`;
      document.getElementById("reg-annual-sales-gst").textContent = `₹${parseFloat(data.annualSummary.salesGst).toFixed(2)}`;
      document.getElementById("reg-annual-purchases-tx").textContent = `₹${parseFloat(data.annualSummary.purchaseTaxable).toFixed(2)}`;
      document.getElementById("reg-annual-purchases-gst").textContent = `₹${parseFloat(data.annualSummary.purchaseGst).toFixed(2)}`;
      document.getElementById("reg-annual-expenses-tx").textContent = `₹${parseFloat(data.annualSummary.expenseTaxable).toFixed(2)}`;
      document.getElementById("reg-annual-expenses-gst").textContent = `₹${parseFloat(data.annualSummary.expenseGst).toFixed(2)}`;



    } catch (err) {
      console.error("Fetch filing registers error:", err);
      showReportErrorAlert("Filing Registers Aggregation Failure", err.message);
    }
  }



  // --- Settings Logo & Save Action Handlers ---
  function updateLogoPreviewUI(logoPath) {
    const preview = document.getElementById("set-logo-preview");
    const placeholder = document.getElementById("set-logo-placeholder");
    const removeBtn = document.getElementById("btn-remove-logo");
    
    if (!preview || !placeholder || !removeBtn) return;
    
    if (logoPath) {
      preview.src = logoPath;
      preview.style.display = "block";
      placeholder.style.display = "none";
      removeBtn.style.display = "inline-block";
    } else {
      preview.src = "";
      preview.style.display = "none";
      placeholder.style.display = "block";
      removeBtn.style.display = "none";
    }
  }

  const setLogoFileInput = document.getElementById("set-logo-file");
  if (setLogoFileInput) {
    setLogoFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity_type", "logo");
      formData.append("entity_id", "business");
      
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
        if (!res.ok) throw new Error("Logo upload failed");
        const data = await res.json();
        if (data.file_path) {
          const setBizLogoPath = document.getElementById("set-biz-logo-path");
          if (setBizLogoPath) setBizLogoPath.value = data.file_path;
          updateLogoPreviewUI(data.file_path);
        }
      } catch (err) {
        alert("Error uploading logo: " + err.message);
      }
    });
  }

  const btnRemoveLogo = document.getElementById("btn-remove-logo");
  if (btnRemoveLogo) {
    btnRemoveLogo.addEventListener("click", () => {
      const setBizLogoPath = document.getElementById("set-biz-logo-path");
      if (setBizLogoPath) setBizLogoPath.value = "";
      updateLogoPreviewUI("");
      const setLogoFileInput = document.getElementById("set-logo-file");
      if (setLogoFileInput) setLogoFileInput.value = "";
    });
  }

  const btnSaveSettings = document.getElementById("btn-save-settings");
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", async () => {
      const name = document.getElementById("set-biz-name").value.trim();
      const gstin = document.getElementById("set-biz-gst").value.trim();
      const state = document.getElementById("set-biz-state").value.trim();
      const stateCode = document.getElementById("set-biz-state-code").value.trim();
      const address = document.getElementById("set-biz-address").value.trim();
      const logoPath = document.getElementById("set-biz-logo-path").value.trim();
      
      if (!name) {
        alert("Business Name is required.");
        return;
      }
      
      if (gstin && gstin.length !== 15) {
        alert("GSTIN must be exactly 15 characters.");
        return;
      }
      
      const apiEnabled = document.getElementById("set-api-enabled").checked ? "true" : "false";
      const apiKey = document.getElementById("set-api-key").value.trim();

      const payload = {
        business_name: name,
        business_gstin: gstin,
        business_state: state,
        business_state_code: stateCode,
        business_city: "",
        business_address: address,
        business_logo_path: logoPath,
        api_enabled: apiEnabled,
        api_key: apiKey
      };
      
      try {
        const res = await fetch("/api/settings/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to save settings");
        alert("Settings saved successfully!");
        checkServerStatus(); // refresh values
      } catch (err) {
        alert("Error saving settings: " + err.message);
      }
    });
  }

  // --- External API UI Event Listeners ---
  function generateRandomApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'mz_api_';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  const setApiEnabled = document.getElementById("set-api-enabled");
  const apiKeySection = document.getElementById("api-key-section");
  const setApiKey = document.getElementById("set-api-key");
  if (setApiEnabled) {
    setApiEnabled.addEventListener("change", () => {
      const isChecked = setApiEnabled.checked;
      if (apiKeySection) apiKeySection.style.display = isChecked ? "block" : "none";
      if (isChecked && (!setApiKey.value || setApiKey.value.trim() === "")) {
        setApiKey.value = generateRandomApiKey();
      }
    });
  }

  const btnCopyApiKey = document.getElementById("btn-copy-api-key");
  if (btnCopyApiKey) {
    btnCopyApiKey.addEventListener("click", () => {
      const apiKeyVal = setApiKey ? setApiKey.value : "";
      if (apiKeyVal) {
        navigator.clipboard.writeText(apiKeyVal)
          .then(() => {
            alert("API key copied to clipboard!");
          })
          .catch(err => {
            console.error("Failed to copy text: ", err);
          });
      }
    });
  }

  const btnRegenApiKey = document.getElementById("btn-regen-api-key");
  if (btnRegenApiKey) {
    btnRegenApiKey.addEventListener("click", () => {
      if (confirm("Are you sure you want to regenerate the API key? Any existing external tool using the old key will lose access.")) {
        if (setApiKey) setApiKey.value = generateRandomApiKey();
      }
    });
  }

  // --- Adjust Product Stock Action Handler ---
  const btnAdjustStock = document.getElementById("btn-adjust-stock");
  if (btnAdjustStock) {
    btnAdjustStock.addEventListener("click", async () => {
      const prodId = document.getElementById("prod-id").value.trim();
      if (!prodId) return;
      
      const qtyStr = prompt("Enter stock adjustment quantity:\n(Use positive numbers to add stock, negative to subtract. E.g. +10 or -5)");
      if (qtyStr === null) return; // Cancelled
      
      const qty = parseFloat(qtyStr);
      if (isNaN(qty) || qty === 0) {
        alert("Please enter a valid non-zero number.");
        return;
      }
      
      try {
        const res = await fetch("/api/products/adjust-stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: prodId, delta: qty })
        });
        if (!res.ok) throw new Error("Failed to adjust stock");
        const data = await res.json();
        
        // Update input field display
        const stockInput = document.getElementById("prod-stock");
        if (stockInput) stockInput.value = data.current_stock;
        
        alert(`Stock adjusted successfully! New current stock: ${data.current_stock}`);
        fetchProducts(); // Refresh dynamic list
      } catch (err) {
        alert("Error adjusting stock: " + err.message);
      }
    });
  }

  // Run dashboard load on startup
  fetchDashboardMetrics();

  // Register hash router after full initialization
  window.addEventListener("hashchange", handleHashRoute);
  handleHashRoute();

});
