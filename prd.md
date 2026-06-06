# SHOPCONTROL 

## PRODUCT VISION

ShopControl is a mobile-first shop operations platform for wholesale, retail, and distribution businesses.

Its purpose is:

* Allow staff to run the shop when the owner is away.
* Allow owners to monitor all shop activity remotely.
* Provide operational visibility across inventory, customers, orders, sales, collections, delivery memos, expenses, attendance, and cash operations.

ShopControl is NOT an accounting system.

Tally remains responsible for:

* Accounting
* GST Filing
* Taxation
* Ledger Management
* Profit & Loss
* Balance Sheet
* Financial Statements

ShopControl manages shop operations only.

---

# ORGANIZATION STRUCTURE

## Multi Tenant

Each business is isolated.

Example:

Vardaman Sales

RK Traders

Jain Distributors

Each business has its own data.

---

## Multi Shop

Each business can have multiple shops.

Example:

Vardaman Sales

* Nagpur Shop
* Jabalpur Shop
* Warehouse

All operational data belongs to a specific shop.

---

## User Roles

Only two roles exist.

### Owner

Full access.

### Staff

Operational access.

No Manager role.

No complex hierarchy.

Multiple users may be Owners.

Example:

* Harsh (Owner)
* Brother (Owner)

Both have full access.

---

# SHOP SWITCHING

Only Owners can switch shops.

Example:

Nagpur

Jabalpur

Warehouse

All dashboards, alerts, inventory, sales, customers, payments, expenses, and reports become shop-specific after switching.

Staff operate only inside assigned shop(s).

---

# CORE MODULES

## 1. CUSTOMER MANAGEMENT

Every customer belongs to a shop.

Customer Profile:

* Name
* Phone
* GSTIN
* Address
* Contact Person
* Credit Limit
* Notes

Customer Overview:

* Total Sales
* Outstanding Amount
* Pending GST Bills
* Pending Delivery Memos
* Last Purchase Date
* Purchase Frequency

Customer Tabs:

* Details
* Sales
* Payments
* Outstanding
* Delivery Memos
* GST Bills
* Timeline

Customer Timeline:

* Sale Created
* Payment Received
* DM Created
* Return Recorded
* Note Added

---

## 2. WALK-IN CUSTOMER

System-generated customer.

Used automatically for counter sales.

Not shown in normal customer listing.

Purpose:

* Keep reporting accurate.
* Avoid fake customer creation.

---

## 3. SALES MANAGEMENT

Sale Types:

* Walk-In Sale
* Customer Sale
* GST Sale
* Non GST Sale
* Credit Sale

Sale Fields:

* Customer
* Items
* Sale Amount
* GST Required
* GST Invoice Generated
* GST Invoice Number
* Payment Status
* Created By

GST Invoice Status:

* NOT_REQUIRED
* PENDING
* GENERATED

Purpose:

Track sales and GST follow-up.

Not GST accounting.

---

## 4. GST BILLING QUEUE

Owner-only review queue.

Tracks:

* GST Required
* Invoice Generated
* Invoice Number
* Generated Date

Owner creates GST invoice in Tally and updates ShopControl.

---

## 5. INVENTORY MANAGEMENT

Every shop maintains its own catalog.

Product Fields:

* SKU
* Product Name
* Category
* Unit
* MRP
* Selling Price
* Minimum Price
* Low Stock Limit

Stock Values:

* Current Stock
* Reserved Stock
* Available Stock
* Packed Stock

Formula:

Available Stock = Current Stock - Reserved Stock

---

## 6. PRICE CONTROL

Each product has:

* Selling Price
* Minimum Price

Example:

Selling Price = ₹90

Minimum Price = ₹80

Staff may sell:

₹90

₹85

₹82

₹80

Below ₹80:

Owner approval required.

---

## 7. PRICE HISTORY

Track:

* Old Price
* New Price
* Changed By
* Date

Used for visibility only.

---

## 8. STOCK ENTRY

Stock Operations:

* Opening Stock
* New Stock Entry
* Stock Adjustment
* Damage Entry

All movements recorded in Stock Ledger.

---

## 9. INVENTORY RESERVATION

Prevent overselling.

Flow:

Order Created

↓

Reserve Inventory

↓

Pack Inventory

↓

Dispatch

↓

Release Reservation

Formula:

Available Stock = Physical Stock - Reserved Stock

---

## 10. ORDER MANAGEMENT

Lifecycle:

DRAFT

CONFIRMED

PACKING

PARTIALLY_PACKED

PACKED

DISPATCHED

CANCELLED

Features:

* Create Order
* Assign Packing
* Reserve Inventory
* Pack Inventory
* Dispatch Inventory
* Convert to Sale
* Convert to DM

---

## 11. PACKING OPERATIONS

Staff Workflow:

* Orders To Pack
* Packing Queue
* Report Shortage
* Mark Packed
* Dispatch Ready

---

## 12. DELIVERY MEMO MANAGEMENT

Lifecycle:

CREATED

PARTIALLY_PAID

PAID

CONVERTED

RETURNED

CANCELLED

OVERDUE

Fields:

* Customer
* Items
* Amount
* Paid Amount
* Pending Amount
* Expected Payment Date

---

## 13. PAYMENT COLLECTION

Purpose:

Collection Tracking

Modes:

* Cash
* UPI
* Bank Transfer
* Card
* Cheque

Supports:

* Full Payment
* Partial Payment
* Split Payment

Example:

Cash ₹400

UPI ₹600

---

## 14. OUTSTANDING TRACKING

Simple collection tracking.

Formula:

Outstanding = Sales - Collections - Returns

Show:

* Outstanding Amount
* Pending Sales
* Pending DMs
* Recent Collections

No accounting allocations.

No accounting ledgers.

---

## 15. CHEQUE TRACKING

Lifecycle:

RECEIVED

DEPOSITED

CLEARED

BOUNCED

Owner controls status updates.

---

## 16. EXPENSE MANAGEMENT

Operational expenses only.

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
* Date
* Created By

---

## 17. CASH COUNTER

Open Day:

* Opening Cash

Track:

* Cash Sales
* Cash Collections
* Cash Expenses
* Cash Deposits

Close Day:

Expected Cash =
Opening Cash

* Cash Sales
* Cash Collections

- Cash Expenses
- Cash Deposits

Compare with Actual Cash.

---

## 18. STAFF MANAGEMENT

Staff Profile:

* Name
* Phone
* Shop
* Status

Attendance:

* Check In
* Check Out
* Half Day
* Leave
* Absent

Activity Tracking:

* Sales Created
* Payments Collected
* Orders Packed
* DMs Created
* Stock Entries Added

---

## 19. ALERTS

Owner Notification Center.

Types:

* Payment Verification
* Stock Entry Approval
* Stock Adjustment Approval
* Damage Approval
* Rate Override Request
* Sale Cancellation Request
* DM Cancellation Request
* Cash Difference Alert
* Low Stock Alert
* GST Pending Alert
* Outstanding Collection Alert

---

## 20. APPROVAL WORKFLOWS

Owner approval required for:

### Inventory

* Stock Adjustment
* Damage Entry

### Pricing

* Selling Below Minimum Price

### Sales

* Sale Cancellation

### Delivery Memo

* DM Cancellation

### Cash

* Cash Difference

### Payments

* Cheque Verification
* Bank Verification

---

## 21. REPORTS

Operational Reports Only.

Sales Reports:

* Daily Sales
* Monthly Sales
* Customer Sales
* Staff Sales

Collection Reports:

* Collections
* Outstanding

Inventory Reports:

* Current Stock
* Low Stock
* Stock Movement

Customer Reports:

* Outstanding Customers
* GST Pending Customers
* Top Customers

Expense Reports:

* Daily Expenses
* Monthly Expenses
* Category Wise Expenses

Staff Reports:

* Attendance
* Activity Reports

---

## 22. AUDIT LOG

Track:

* Sale Created
* Sale Edited
* Payment Collected
* DM Created
* Order Packed
* Price Changed
* Stock Adjusted
* Expense Added
* Approval Given

---

# OWNER DASHBOARD

Widgets:

* Today's Sales
* Today's Collections
* Outstanding Amount
* Pending GST Bills
* Orders To Pack
* Pending DMs
* Low Stock
* Pending Approvals
* Expenses Today
* Cash Difference
* Staff Present

---

# STAFF DASHBOARD

Actions:

* New Sale
* Take Payment
* Create Order
* Create DM
* Search Inventory
* Orders To Pack
* Add Expense
* Stock Entry
* Open Day
* Close Day

No accounting screens.

No ERP screens.

---

# FINAL PRODUCT RULE

Whenever a new feature is proposed, ask:

"Does this help staff run the shop or help the owner monitor the shop?"

If YES → Build it.

If it mainly belongs to accounting, taxation, bookkeeping, GST filing, or financial reporting → Leave it to Tally.

ShopControl runs the shop.

Tally closes the books.
