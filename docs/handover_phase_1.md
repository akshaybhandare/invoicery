# Phase 1 Handover: Project Setup & Local Server Bootstrap

This document details the completed components for **Phase 1** and lists the steps to launch and verify the implementation on your machine.

---

## 🏗️ What was implemented in Phase 1

1. **Bun Project Configurations** (`package.json`):
   - Configured scripts to launch the application using Bun: `bun run dev` (with hot-reloading enabled).
2. **SQLite Database Initialization** (`src/database.ts`):
   - Database creates `data/billing.db` inside the `./data/` folder.
   - Built-in table initialization for 12 relational schemas: settings, customer list, product catalogue, invoices, invoice line items, purchases, expenses, and attachments.
   - Seeding rules: Populates base state as **Karnataka** (State code: `29`), default invoice formatting details (`INV-` prefix, sequence starting index `1`), and standard GST tax bands (0%, 5%, 12%, 18%, 28%).
3. **High-Performance Local Server** (`src/server.ts`):
   - Runs using Bun's native `Bun.serve`.
   - Listens exclusively on `127.0.0.1:3000` for offline security.
   - Serves static resources (`/index.html`, `/style.css`, `/app.js`) and routes API health queries (`/api/status`).
4. **Single Page Application Base UI** (`public/index.html`, [public/style.css](file:///Users/akshaybhandare/3D/GST/myZoho/public/style.css), [public/app.js](file:///Users/akshaybhandare/3D/GST/myZoho/public/app.js)):
   - Premium **Caldera Design System** integration:
     - **Volcanic Aesthetic**: Page canvas set on a warm medium-gray **Pumice** (`#e2e2df`) background, with off-white **Limestone** (`#f7f6f2`) for card backplates.
     - **Pill-shaped Navigation Container**: The top nav menu resides inside a floating Limestone pill container (800px radius) with an Obsidian border.
     - **Aggressive Accent Color**: Vivid **Ember** orange (`#fc5000`) acts as the single chromatic highlight for primary pill buttons and featured cards.
     - **Halftone/Tag Highlights**: Category tags use a soft **Sulfur** yellow (`#f5f28e`) tag with Obsidian text.
     - **Industrial Typography**: Mapped display headings to **Bebas Neue** (compressed ultrabold display face with positive tracking `0.02em` to keep letterforms scannable) and body copy to **DM Sans** (strictly using weight **500 Medium** throughout, preventing thin/anemic body lines).
     - **Triple-Radius Hierarchy**: 100px for text inputs (full pill fields), 40px for content cards/rectangular buttons, and 800px for primary action buttons.
     - **Flat & Shadowless**: Deliberately shadowless layout that uses color block contrast and **1.5px dotted Obsidian dividers** for separation.
   - Complete SPA navigation (switching dashboard, customers, products, invoices, settings panels dynamically without server-side routing).
   - Real-time backend status checking indicator.
   - Active global focus shortcut (pressing `Ctrl+F` focuses the search bar).

---

## 🚀 How to Run & Verify

Follow these steps to launch the app locally:

### Step 1: Install Bun (if not already installed)
If you do not have Bun installed on your Mac, run this in your terminal:
```bash
curl -fsSL https://bun.sh/install | bash
```
*(Or install it via Homebrew: `brew install oven-sh/bun/bun`)*

### Step 2: Start the Local Development Server
From your terminal, navigate to your project directory `/Users/akshaybhandare/3D/GST/myZoho` and start the server:
```bash
# Navigate to the workspace
cd /Users/akshaybhandare/3D/GST/myZoho

# Start the dev server
bun run dev
```

### Step 3: Verify the Connection and Database Seeding
1. Open your browser and go to: `http://localhost:3000`
2. You will see the **Dashboard** rendered in the bold Caldera style.
3. Check the right status badge inside the floating nav menu: it should say **`ONLINE`** in Obsidian, indicating a successful connection.
4. Click on the **SETTINGS** link in the nav pill to verify that the business state has been seeded successfully as **Karnataka** with state code **29**.
5. You can also view the raw JSON data containing seeded parameters by going directly to: `http://localhost:3000/api/status`

### Step 4: Verify UI Routing and Shortcuts
1. Click the different menu links (CUSTOMERS, PRODUCTS, INVOICES, etc.). You should see the panels switch instantly.
2. Press `Ctrl + F` (or `Cmd + F` on Mac). The search input in the nav container should focus automatically. Press `Esc` to unfocus.
