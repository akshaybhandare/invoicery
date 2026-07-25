```rst
===========================================
Personal Billing & Expense Tracker
Software Requirements Specification (SRS)
===========================================

:Project: Personal Billing & GST Assistant
:Version: 1.0
:Author: Personal Use
:Status: Draft

================
1. Introduction
================

Purpose
=======

The application is a desktop-first billing and accounting software designed for
personal business use. It will manage customers, products, invoices, purchases,
expenses, payments, and GST records while remaining lightweight and completely
offline.

The primary objective is not to replace ERP software, but to simplify daily
business operations and generate accurate GST reports that can later be used to
prepare GSTR-1 and GSTR-3B returns.

Goals
=====

* Fast invoice creation.
* Track all sales and purchases.
* Track operating expenses.
* Maintain customer ledger.
* Generate GST summaries.
* Generate reports required for filing GST.
* Export data for backup.
* Simple UI with minimal bookkeeping knowledge required.

Out of Scope
============

* Direct GST portal filing.
* Bank integrations.
* Payroll.
* Inventory manufacturing.
* Multi-company support (initial version).
* E-commerce integrations.

===================
2. High Level Design
===================

Main Modules

1. Dashboard
2. Customers
3. Products
4. Sales Invoices
5. Purchases
6. Expenses
7. Payments
8. Reports
9. GST Reports
10. Settings
11. Backup & Restore

==================
3. Customer Module
==================

Purpose
=======

Maintain complete customer records.

Customer Fields
===============

Mandatory

* Customer ID
* Name

Optional

* GSTIN
* PAN
* Email
* Phone
* Billing Address
* Shipping Address
* State
* State Code
* Country
* Place of Supply
* Contact Person
* Notes

Features
========

* Create customer
* Edit customer
* Delete customer
* Search customer
* View invoice history
* View outstanding balance
* Export customer list

=================
4. Product Module
=================

Purpose
=======

Maintain products and services sold.

Product Fields
==============

* Product ID
* SKU
* Product Name
* Description
* HSN/SAC Code
* GST Rate
* Unit
* Purchase Price
* Selling Price
* Current Stock
* Reorder Level
* Active Flag

Features
========

* Add product
* Edit product
* Archive product
* Search products
* Import products
* Export products

===================
5. Invoice Management
===================

Purpose
=======

Generate GST compliant invoices.

Invoice Header
==============

* Invoice Number
* Invoice Date
* Customer
* Place of Supply
* Payment Terms
* Due Date
* Notes

Invoice Items
=============

Each row contains

* Product
* Description
* Quantity
* Unit
* Rate
* Discount
* Taxable Value
* GST Rate
* CGST
* SGST
* IGST
* Line Total

Invoice Totals
==============

* Taxable Amount
* Total CGST
* Total SGST
* Total IGST
* Round Off
* Grand Total

Invoice Status

* Draft
* Confirmed
* Paid
* Partially Paid
* Cancelled

Features
========

* Create invoice
* Duplicate invoice
* Print invoice
* PDF export
* Email invoice
* Cancel invoice
* Credit note support (future)
* Invoice search

Invoice Numbering
=================

Configurable format.

Example

::

    INV-2026-0001

or

::

    FY26/0001

=================
6. Purchase Module
=================

Purpose
=======

Track purchases from suppliers.

Fields

* Purchase Number
* Supplier
* Invoice Number
* Invoice Date
* GSTIN
* Product
* Quantity
* Purchase Price
* GST
* Total
* Payment Status

Features

* Record purchase
* Edit purchase
* Attach invoice PDF
* Track input GST

=================
7. Expense Module
=================

Purpose
=======

Track all non-product expenses.

Expense Categories

* Rent
* Electricity
* Internet
* Fuel
* Courier
* Packing
* Marketing
* Office Supplies
* Repairs
* Miscellaneous

Expense Fields

* Expense Date
* Vendor
* Category
* Amount
* GST
* Payment Method
* Notes
* Attachment

Features

* Add expense
* Edit expense
* Delete expense
* Search expenses
* Monthly summary

==================
8. Supplier Module
==================

Fields

* Supplier Name
* GSTIN
* Phone
* Email
* Address
* State

Features

* Purchase history
* Outstanding balance

=================
9. Payment Module
=================

Payment Methods

* Cash
* UPI
* Bank Transfer
* Credit Card
* Debit Card
* Cheque

Receipts

Track customer payments.

Fields

* Customer
* Invoice
* Amount
* Date
* Reference Number

Payments

Track supplier payments.

==================
10. Dashboard
==================

Dashboard Widgets

Sales

* Today's Sales
* Monthly Sales
* Yearly Sales

Expenses

* Today's Expenses
* Monthly Expenses

GST

* Output GST
* Input GST
* GST Payable

Business

* Outstanding Receivables
* Outstanding Payables

Charts

* Monthly Sales
* Monthly Expenses
* Profit Trend

====================
11. Reports Module
====================

Sales Reports

* Daily Sales
* Monthly Sales
* Customer-wise Sales
* Product-wise Sales
* GST Rate Summary
* HSN Summary

Purchase Reports

* Monthly Purchases
* Supplier Summary
* Input GST

Expense Reports

* Category-wise
* Monthly
* Vendor-wise

Profit Reports

* Gross Profit
* Net Profit
* Expense Breakdown

Customer Reports

* Outstanding
* Payment History

==================
12. GST Module
==================

Purpose
=======

Generate reports required for GST filing.

Track

Output Tax

* CGST
* SGST
* IGST

Input Tax

* Purchase GST
* Expense GST

Reports

GSTR-1 Summary

* B2B Sales
* B2C Large
* B2C Small
* Exports
* Nil Rated
* HSN Summary

GSTR-3B Summary

3.1

* Taxable Supplies
* Zero Rated
* Nil Rated
* Reverse Charge

3.2

* Interstate Sales

4

* Eligible ITC

5

* Exempt Supplies

6

* Tax Payment Summary

Monthly GST Summary

Should display

::

    Total Taxable Sales

    Output CGST

    Output SGST

    Output IGST

    Input CGST

    Input SGST

    Input IGST

    Net GST Payable

=======================
13. Document Attachments
=======================

Supported

* PDF
* JPG
* PNG

Can attach

* Purchase invoices
* Expense receipts
* Delivery challans

==================
14. Search
==================

Global Search

Search by

* Invoice Number
* Customer
* Product
* Supplier
* GSTIN
* Date
* Amount

==================
15. Backup
==================

Features

* Manual backup
* Automatic backup
* Restore backup

Backup Includes

* Database
* Attachments
* Settings

==================
16. Settings
==================

Business Details

* Business Name
* Address
* GSTIN
* PAN
* Phone
* Email

Invoice

* Invoice Prefix
* Starting Number

GST

* Default GST Rates
* HSN Codes

=====================
17. Security
=====================

Authentication

* Local login
* Password protection

Future

* User roles
* Multiple users

=====================
18. Database Entities
=====================

Core Tables

* customers
* suppliers
* products
* invoices
* invoice_items
* purchases
* purchase_items
* expenses
* payments
* expense_categories
* gst_rates
* settings
* attachments

Relationships

::

    Customer
       |
       +------ Invoice
                  |
                  +------ Invoice Item
                              |
                              +------ Product

    Supplier
       |
       +------ Purchase
                  |
                  +------ Purchase Item

=====================
19. Functional Requirements
=====================

FR-001
-------

System shall allow customer management.

FR-002
-------

System shall allow product management.

FR-003
-------

System shall generate invoices.

FR-004
-------

System shall calculate GST automatically.

FR-005
-------

System shall track payments.

FR-006
-------

System shall record expenses.

FR-007
-------

System shall generate profit reports.

FR-008
-------

System shall generate GST summaries.

FR-009
-------

System shall export reports as PDF and CSV.

FR-010
-------

System shall support database backup and restore.

=========================
20. Non-Functional Requirements
=========================

Performance

* Invoice creation under 200 ms.
* Search results under 100 ms.

Reliability

* No data loss.
* Automatic transaction rollback.

Usability

* Keyboard-first navigation.
* Minimal clicks.
* Dark mode.

Maintainability

* Modular architecture.
* Repository pattern.
* Service layer.

Portability

* Windows
* Linux
* macOS

Database

* SQLite initially.
* PostgreSQL migration possible later.

=====================
21. Future Enhancements
=====================

* Inventory management
* Barcode support
* Purchase Orders
* Delivery Challans
* Credit Notes
* Debit Notes
* Quotation module
* Stock valuation
* Multi-business support
* Multi-user support
* Cloud synchronization
* Mobile application
* QR code on invoices
* UPI payment QR
* GST JSON export
* Direct GSTN integration
* E-way bill generation
* E-invoicing
* Sales analytics
* AI expense categorization
* AI invoice OCR
* AI monthly financial insights
* Scheduled automatic reports

=====================
22. Success Criteria
=====================

The application shall enable a complete monthly accounting workflow:

1. Add customers and products.
2. Create sales invoices.
3. Record purchases.
4. Record business expenses.
5. Record customer payments.
6. Generate monthly profit and loss reports.
7. Produce GST summaries matching GSTR-1 and GSTR-3B requirements.
8. Export reports for archival or later GST filing.
9. Maintain complete historical records with searchable transactions.
```
