# SHOPCONTROL V2 – PRODUCT RESET & ARCHITECTURE FREEZE

**Treat this document as the source of truth for all schema, service, API, UI, workflow, and architectural decisions.**

## PRODUCT IDENTITY

ShopControl is NOT:

* ERP
* Accounting Software
* Tally Replacement
* SAP Clone
* Busy Clone
* Double Entry Accounting System
* General Ledger System
* GST Filing System
* Financial Reporting Platform

Tally remains the accounting system.

ShopControl is a:

**RETAIL & DISTRIBUTION OPERATIONS PLATFORM**

Purpose:

* Allow staff to run the shop when the owner is away.
* Allow owners to monitor everything remotely.
* Centralize day-to-day shop operations.

The system focuses on:

* Sales Operations
* Customer Operations
* Inventory Operations
* Order Operations
* Packing & Dispatch Operations
* Delivery Memo Operations
* Payment Collections
* Staff Operations
* Cash Counter Operations
* Expense Tracking
* GST Invoice Follow-up

NOT accounting.

---

## ORGANIZATION MODEL

### Multi Tenant

Each business is completely isolated.

Example:

Vardaman Sales

RK Traders

Jain Distributors

Data must never leak across businesses.

---

### Multi Shop

Each business can have multiple shops.

Example:

Vardaman Sales

* Nagpur
* Jabalpur
* Warehouse

All operational records belong to a shop.

Including:

* Customers
* Products
* Inventory
* Sales
* Orders
* Delivery Memos
* Payments
* Expenses
* Attendance
* Cash Sessions
* Alerts

---

### Users & Roles

Only two roles exist.

#### OWNER

Full access.

Can:

* Access all shops
* Switch shops
* Approve requests
* Manage staff
* View reports
* Manage products
* Manage customers

Multiple owners are allowed.

Example:

* Harsh (Owner)
* Harsh Brother (Owner)

Both have full access.

---

#### STAFF

Operational access only.

Can:

* Create sales
* Create delivery memos
* Take payments
* Pack orders
* Add expenses
* Add stock entries
* Search inventory

Cannot:

* Approve requests
* Change prices below minimum
* Manage staff
* Access owner reports

---

## SHOP SWITCHING

Only Owners can switch shops.

Example:

* Nagpur
* Jabalpur
* Warehouse

All dashboards, alerts, reports, inventory, customers, sales, and payments become shop-specific after switching.

Notifications are also shop-specific.

---

## REAL BUSINESS FLOW

Example:

ABC Enterprise visits shop.

Owner is absent.

Staff creates:

Sale = ₹5,000

Customer = ABC Enterprise

GST Sale = YES

Invoice Generated In Tally = NO

Later owner comes.

Owner sees:

ABC Enterprise

Outstanding = ₹5,000

GST Invoice Pending

Owner creates GST invoice in Tally.

Owner marks:

Invoice Generated = YES

Invoice Number = VS-2026-145

Done.

This is the exact workflow we are optimizing.

---

## CORE MODULES

These are the ONLY V1 modules.

---

### 1. CUSTOMER MANAGEMENT

This is a first-class module.

Customer is the center of the system.

Every sale, DM, payment, return, and outstanding must connect to a customer.

Customer Profile:

* Name
* GSTIN
* Phone
* Address
* Contact Person
* Credit Limit
* Notes

Customer Analytics:

* Total Sales
* Outstanding
* Last Purchase
* Average Order Value
* Purchase Frequency
* GST Bills Pending
* Pending DMs

Customer Timeline:

* Sales
* DMs
* Payments
* Returns
* Notes
* Activities

Customer Tabs:

* Details
* Sales
* Payments
* Outstanding
* Delivery Memos
* GST
* Timeline

Special Views:

* GST Pending Customers
* Outstanding Customers
* Frequent Buyers
* New Customers

---

### 2. WALK-IN CUSTOMER

System-generated customer.

Used automatically for counter sales.

Not visible in normal customer management.

Purpose:

* Fast checkout
* Accurate reporting
* No fake customer creation

---

### 3. SALES

Features:

* Walk-In Sale / Counter sale
* Customer Sale -- whose data we have , might be gst or not 
* GST Sale
* Order Sale
* DM Conversion Sale
* Sale Return

Sale Fields:

* Customer
* Sale Type
* GST Required
* GST Invoice Generated
* GST Invoice Number
* Payment Status 
* Payment Mode
* Timestamp
* Created By

Invoice Status:

* NOT_REQUIRED
* PENDING
* GENERATED

Purpose:

Track business activity.

Not generate GST filings.

---

### 4. GST BILLING QUEUE

Owner-only review queue.

Tracks:

* GST Required
* GST Invoice Generated
* GST Invoice Number
* Invoice Generated Date

Purpose:

Follow-up for Tally billing.

Not GST accounting.

---

### 5. DELIVERY MEMO

Features:

* Create DM
* Edit DM
* Return Against DM
* Convert DM To Sale
* Close DM

DM Fields:

* Customer
* Items
* Returned Qty
* Amount
* Paid Amount
* Pending Amount
* Expected Payment Date
* Status

Statuses:

* CREATED
* PARTIALLY_PAID
* PAID
* CONVERTED
* RETURNED
* CANCELLED
* OVERDUE

---

### 6. ORDER MANAGEMENT

Features:

* Create Order
* Assign Order
* Reserve Inventory
* Pack Order
* Report Shortage
* Dispatch

Statuses:

* DRAFT
* CONFIRMED
* PACKING
* PARTIALLY_PACKED
* PACKED
* DISPATCHED
* CANCELLED

---

### 7. INVENTORY

Inventory is a critical module.

Features:

* Product Catalog
* Product Search
* Current Stock
* Stock Entry
* Stock Adjustment
* Damage Entry
* Inventory Returns
* Low Stock Alerts
* Inventory Reservations

Must support:

* StockLedger
* StockReservation

Inventory accuracy is mandatory.

---

### 8. PRODUCT PRICING

Every product contains:

* MRP
* Selling Price
* Minimum Price

Example:

MRP = ₹100

Selling Price = ₹90

Minimum Price = ₹80

Staff may sell:

₹90

₹85

₹82

₹80

Below ₹80 requires owner approval.

---

### 9. PRICE HISTORY

Track:

* Previous Price
* New Price
* Changed By
* Changed At

Purpose:

Visibility and audit.

---

### 10. PAYMENTS

Purpose:

Collection Tracking.

NOT accounting.

Payment Types:

* Cash
* UPI
* Bank
* Card
* Cheque

Supports:

* Full Payment
* Partial Payment
* Split Payment

Track:

* Received
* Pending
* Verified
* Rejected

Payment Sources:

* Sale
* DM
* Customer

---

### 11. CUSTOMER OUTSTANDING

Keep simple.

Required:

* Outstanding Amount
* Payment History

Required Calculation:

Outstanding = Total Sales - Total Payments - Total Returns

No ERP-level allocation engines.

No journal entries.

No accounting ledgers.

---

### 12. CHEQUE TRACKING

Lifecycle:

* RECEIVED
* DEPOSITED
* CLEARED
* BOUNCED

Owner controls status updates.

---

### 13. SHOP EXPENSES

Operational expense tracking only.

Categories:

* Freight
* Courier
* Porter
* Tea
* Snacks
* Packaging
* Labour
* Petrol
* Electricity
* Internet
* Miscellaneous

Fields:

* Amount
* Category
* Note
* Photo
* Created By
* Date

Purpose:

Owner visibility.

Not accounting.

---

### 14. CASH COUNTER

Features:

* Open Day
* Opening Cash
* Cash Sales
* Cash Collections
* Cash Expenses
* Cash Deposits
* Expected Cash
* Actual Cash
* Close Day
* Difference

---

### 15. STAFF MANAGEMENT

Features:

* Attendance
* Check In
* Check Out
* Leave
* Activity Tracking

Track:

* Sales Created
* Payments Collected
* Orders Packed
* DMs Created
* Stock Entries
* Adjustments

---

### 16. ALERTS

Features:

* Low Stock
* Pending Verification
* Pending GST Invoice
* Outstanding Collections
* Assigned Orders
* Cash Difference
* Rate Approval Requests
* Stock Approval Requests
* DM Cancellation Requests
* Sale Cancellation Requests

---

### 17. APPROVAL WORKFLOWS

Owner approval required for:

* Selling below Minimum Price
* Stock Adjustment
* Damage Entry
* Sale Cancellation
* DM Cancellation
* Cash Difference
* Cheque Verification
* Bank Verification

---

### 18. REPORTS

Only operational reports.

Allowed:

* Daily Sales
* Monthly Sales
* Customer Sales
* Outstanding Report
* Collection Report
* Expense Report
* Stock Report
* Staff Activity
* Cash Summary
* GST Pending Report
* DM Report

---

## FEATURES TO REMOVE

Remove or avoid:

* General Ledger
* Journal Entries
* Trial Balance
* Chart Of Accounts
* Balance Sheet
* P&L
* GST Accounting Engine
* Accounting ERP
* Financial Posting System
* Double Entry Bookkeeping
* Credit Notes
* Payment Allocation Engine
* Voucher System

These belong in Tally.

---

## INVENTORY RESERVATION

KEEP THIS.

Reservation Flow:

Order Created → Reserve Stock → Pack Stock → Dispatch → Release Reservation

Available Stock:

Available = Physical Stock - Active Reservations

Prevent overselling.

Use transaction-safe locking.

---

## DATABASE PRINCIPLES

Use:

* Prisma Enums
* Prisma Relations
* Transactions
* Soft Deletes
* Audit Logs
* Strict Types

Avoid:

* Premature ERP Tables
* Accounting Ledgers
* Financial Complexity

Every table must solve a real operational problem.

Every operational record must belong to a shop.

---

## MONEY & QUANTITY RULES

Global Helpers:

money() -> Decimal, 2 places, HALF_UP

qty() -> Decimal, 3 places, HALF_UP

Never use floating point arithmetic.

Never manually round.

All calculations must use centralized helpers.

---

## AUDIT LOG

Keep audit logging.

Track:

* Who created sale
* Who created DM
* Who took payment
* Who adjusted stock
* Who packed order
* Who changed price
* Who approved corrections

---

## OWNER DASHBOARD

Owner sees:

* Today's Sales
* Outstanding Collections
* GST Invoices Pending
* Low Stock
* Staff Activity
* Pending Verifications
* Expenses
* Cash Summary
* Pending DMs
* Orders To Pack

---

## STAFF DASHBOARD

Staff sees:

Workflows / Counter:

* New Sale
* Take Payment
* Create Order
* Open Cash

Operations:

* Orders To Pack
* Create DM
* Stock Entry
* Inventory Search
* Add Expense
* Close Day

No accounting screens.

No ERP screens.

---

## FINAL RULE

Whenever making any architectural decision ask:

"Does this help the staff run the shop or help the owner monitor the shop?"

If YES:

Implement it.

If it mainly helps accounting:

Leave it for Tally.

ShopControl = Operations Platform

Tally = Accounting Platform

Never mix the two.
