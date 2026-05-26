# PRD: Shop Operations & Owner Control App

---

## 1. Product Overview

### Product Name

**ShopControl**
Working alternatives: **OwnerDesk**, **CounterControl**, **StaffPOS**, **StoreOps**

### Product Type

Mobile-first shop operations app for retail/wholesale shop owners and staff.

### One-line Summary

A simple mobile app where the owner can create orders, monitor shop activity, view past selling rates, and control payments/stock remotely, while staff can handle sales, packing, dispatch, DM/unbilled sale, stock movement, payments, and day closing.

### Core Product Principle

This app is **not a Tally replacement** and **not a full accounting system**.

It is a **shop operations and owner-control system**.

Tally will remain for final accounting later. In MVP, the app will only generate daily operational summaries. Tally integration can be added later because TallyPrime supports importing masters and transactions from Excel, XML, and JSON formats.

---

## 2. Why We Are Building This

### Problem

The owner is not always present at the shop. Staff may not be comfortable with Tally or complex software. Because of this, the owner does not get reliable live visibility of:

```
Today sales
Cash collected
UPI/card/bank payments
Cheque received
Cheque cleared or bounced
Party/customer pending amount
DM/unbilled goods
Stock movement
Orders pending packing
Orders dispatched
Staff activity
Counter cash mismatch
Previous selling rates
```

Many things happen through calls, WhatsApp, paper notes, or memory. This causes:

```
Cash mismatch
Payment confusion
Wrong selling rate
Stock leakage
Untracked DM/unbilled sale
Forgotten customer orders
No proof of dispatch
No proper staff accountability
Delayed daily closing
```

### Product Goal

Build a simple mobile app where:

```
Owner gives command
Staff executes
System records everything
Owner sees full live status
```

Main flow:

```
Order → Packing → Dispatch → DM/Sale → Payment → Stock Ledger → Daily Summary
```

---

## 3. MVP Scope

### Included in MVP

```
One Expo mobile app
Two roles: Owner and Staff
Multi-shop support
Customer/party master
Item master
Opening stock entry flow
Owner-created order management
Staff packing and dispatch workflow
Walk-in / counter sale shortcut
DM / unbilled sale
Normal sale
Split/mixed payments
Cash payment
UPI payment
Card payment
Bank transfer payment
Cheque entry and lifecycle
Credit/pending payment with due date
Advance payment against orders
Stock in/out
Damage/loss entry
Customer-wise price history
Item-wise recent sold rates
Rate change request with suggested rate
Counter/day closing
Cash reconciliation with simplified expense handling
Payment verification
Correction requests
Audit logs
Notification triggers
Daily summary
PDF/CSV export
Consistent number format for orders/sales/DM
```

### Not Included in MVP

```
Direct Tally integration
GST filing
E-invoice
E-way bill
Full accounting ledger
Payroll
Advanced CRM
Customer mobile app
WhatsApp order automation
Courier integration
Barcode hardware integration
Offline-first sync
Automatic bank reconciliation
Direct Razorpay/PhonePe/Paytm API sync
Multi-currency
GST/tax fields
Manager/Supervisor role
Item subcategories beyond one level
Push notification infrastructure (Sprint 1)
```

---

## 4. Benchmark Notes

The product design follows common POS/retail patterns.

Shopify POS supports split payments where the cashier enters one payment amount, selects a payment method, and repeats for the remaining amount. Square also supports split tender, where customers can complete one bill using multiple payment forms.

Order packing/fulfillment is also a known POS pattern. Shopify POS supports pickup orders where staff can use a pick-and-pack workflow to prepare and fulfill orders.

Different selling prices per customer/product are also a standard retail concept. Odoo supports pricelists for unique pricing strategies and allows overriding suggested prices on sales orders.

Cheque needs separate lifecycle tracking because RBI explains cheque truncation as stopping physical cheque movement once an electronic image is generated for clearing.

---

## 5. Tech Stack Decision

### Mobile App

```
Expo + React Native + TypeScript
```

Reason: one mobile app can serve both owner and staff using RBAC. Expo Router provides file-based routing for React Native/web apps and protected screens to prevent unauthorized route access.

### UI Library

```
React Native Paper
```

Reason: React Native Paper provides production-ready Material Design components for React Native, reducing custom component work.

### Backend

```
Node.js / NestJS
PostgreSQL
Prisma ORM
JWT Auth
RBAC middleware
Object storage for images/proofs
```

### App Support Libraries

```
Expo Router
React Native Paper
TanStack Query
Zustand
React Hook Form
Zod
Expo Image Picker / Camera later
Expo SQLite later if offline drafts are needed
```

---

## 6. Users and Roles

### MVP Roles

```
OWNER
STAFF
```

> Only two roles in MVP. No Manager or Supervisor role will be added until validated by real usage.

### Owner Role

Owner has full access.

Owner can:

```
Create shop
Create/manage staff
Create/manage customers
Create/manage items
Set opening stock per item
Create customer/party orders
Set item rates in order
View previous sold rates
View order status
View packing status
View dispatch status
View all sales
View all DM/unbilled sale
View all payments
View all stock
Verify UPI/card/bank payments
Mark cheque deposited/cleared/bounced
Review day closing
Approve correction requests
Approve/reject rate change requests
Lock daily summary
Export daily summary
```

### Staff Role

Staff handles shop operations.

Staff can:

```
View assigned orders
Pack order items
Report shortage
Create DM from order
Dispatch order
Create walk-in/counter sale (no customer selection required)
Create regular sale
Create DM/unbilled sale
Record payment
Record split/mixed payment
Record cheque received
Add stock in
Add stock out
Record damage/loss
Close day
View today summary
Request correction
Request cancellation
Request rate change with suggested rate
```

Staff cannot:

```
Delete records
Edit old records directly
Approve own correction
Change owner-set order rate directly
View full price history unless allowed
Verify UPI/card/bank payments
Mark cheque cleared/bounced
Lock daily summary
Export owner reports
Manage users
```

Backend must enforce RBAC, not just hide screens in the app. OWASP highlights broken access control as a major risk when users can access or modify data outside their intended permissions.

---

## 7. Business Structure

The app supports one owner with one or many shops.

```
Owner
  └── Business
        └── Shop
              └── Staff
              └── Cash Session
```

Example:

```
Owner
  ├── Nagpur Shop
  └── Jabalpur Shop
```

Each shop has separate:

```
Shop name
Staff access
Stock
Opening stock
Orders
Payments
Cash session
Daily summary
```

---

## 8. Record Number Format

All records use a consistent, human-readable number format. This makes it easy to reference records over WhatsApp or phone calls.

```
Orders:  ORD-YYYYMMDD-001
Sales:   SAL-YYYYMMDD-001
DM:      DM-YYYYMMDD-001
```

- Counter resets daily per shop.
- If a shop generates more than 999 records in a day, counter continues as 1000, 1001, etc.
- Number is generated by the backend, not the app.

---

## 9. Main Product Workflow

### Daily Workflow

```
1.  Staff logs in.
2.  Staff opens assigned shop.
3.  Staff starts or continues today's cash session.
4.  Owner creates party/customer order if order came directly to owner.
5.  Staff sees order in Orders to Pack.
6.  Staff packs items.
7.  Staff reports shortage if stock is not available.
8.  Staff dispatches packed items.
9.  Staff creates DM or sale from order.
10. Staff records payments: cash, UPI, card, bank, cheque, credit, or mixed.
11. Stock ledger updates.
12. Staff creates walk-in sale directly if customer comes to counter.
13. Staff creates regular sale/DM if needed.
14. Staff closes day.
15. Owner reviews sales, payments, cheques, DM, orders, stock, and cash.
16. Owner verifies payments.
17. Owner locks daily summary.
18. Owner exports PDF/CSV if needed.
```

---

## 10. App Navigation

### Common

```
Login
Profile
Notifications
```

### Staff Home

Primary buttons:

```
Orders to Pack
New Sale (Walk-in shortcut + Regular)
Create DM
Take Payment
Stock Entry
Close Day
Today Summary
```

### Owner Home

Dashboard cards:

```
Today Sales
Today Orders
Orders to Pack
Orders Dispatched
Pending DM
Pending Payment
Cash Collected
UPI/Card/Bank Collected
Cheque Pending
Stock Alerts
Cash Difference
Payment Verification
Price Change Requests
Daily Summary
```

---

## 11. Module 1: Authentication and RBAC

### Requirements

```
User logs in using mobile/email + password or PIN.
Backend returns role and permissions.
App shows screens based on permissions.
Backend validates every protected API request.
```

### Permissions

```
sale:create
sale:view_own
sale:view_all
sale:cancel_request
sale:cancel_approve

order:create
order:view_all
order:view_assigned
order:update
order:cancel
order:assign_staff

packing:view
packing:start
packing:update
packing:complete

dispatch:create
dispatch:view

dm:create
dm:view_own
dm:view_all
dm:close
dm:cancel_request

payment:create
payment:view_own
payment:view_all
payment:verify

cheque:create
cheque:deposit
cheque:clear
cheque:bounce

stock:create_movement
stock:view

price_history:view_full
price_history:view_customer_only
price_history:suggest_rate
rate:override
rate:change_request

cash_session:open
cash_session:close
cash_session:review

daily_summary:view
daily_summary:lock
daily_summary:export

correction:request
correction:approve

notification:view
```

### Acceptance Criteria

```
Staff cannot open owner-only screens.
Staff cannot approve corrections.
Staff cannot mark cheque cleared/bounced.
Owner can access all data.
Backend blocks unauthorized actions even if API is called manually.
```

---

## 12. Module 2: Shop Setup

### Shop Fields

```
Shop name
Shop code
City
Address
Owner ID
Assigned staff
Opening cash
Active/inactive status
```

### Acceptance Criteria

```
Owner can create/edit shops.
Owner can assign staff to a shop.
Staff can access only assigned shops.
Owner can filter dashboard and reports by shop.
```

---

## 13. Module 3: Opening Stock Entry

### Purpose

When a shop is first set up, the owner needs to enter existing stock for all items. Without this, stock ledger starts from zero and becomes inaccurate from day one.

### Flow

```
Owner opens shop settings.
Owner taps Set Opening Stock.
Owner sees list of all active items.
Owner enters opening quantity for each item.
Owner submits.
System creates a stock_ledger entry per item with movement_type = Opening Stock.
Opening stock can only be set once per shop per item.
If needed later, owner uses Manual Adjustment with reason.
```

### Rules

```
Opening stock entry is available only before first sale/DM/order in that shop.
After first transaction, opening stock is locked.
Owner can still do Manual Adjustment from stock module with reason.
```

### Acceptance Criteria

```
Owner can enter opening stock for all items in one screen.
System creates audit-traceable stock ledger entries.
Opening stock cannot be silently overwritten after first transaction.
```

---

## 14. Module 4: Customer / Party Master

### Purpose

Customer/party master is needed for:

```
Orders
DM/unbilled sale
Pending payment
Cheque tracking
Price history
Customer-wise outstanding
```

### Customer Fields

```
Customer name
Phone
Address
City
GSTIN optional
Customer type
Credit limit optional
Outstanding amount
Notes
Status
Created by
Created at
```

### Customer Profile Shows

```
Total sales
Total pending amount
Pending DM
Pending orders
Cheque pending
Last order date
Last payment date
Item-wise price history
Payment history
```

### Acceptance Criteria

```
Owner can create customer.
Staff can select customer while creating sale/DM/payment.
Owner can see customer-wise pending amount.
Owner can see customer-item price history.
```

---

## 15. Module 5: Item Master

### Item Fields

```
Item name
Item code / SKU
Category
Unit
Default selling price
Minimum allowed price optional
Purchase price optional
MRP optional
Opening stock
Minimum stock alert
Active/inactive status
Image optional
```

### Item Rules

```
Same item can be sold at different rates.
Current item price does not affect past transactions.
Each sale/order/DM item stores actual rate used.
Stock is tracked shop-wise.
Stock cannot go negative unless owner setting allows.
```

### Acceptance Criteria

```
Owner can add/edit item.
Staff can search item.
Staff can sell item.
Stock reduces after sale/DM/dispatch.
Low stock appears on owner dashboard.
```

---

## 16. Module 6: Order Management

### Purpose

Owner may receive an order from a party/customer directly. Owner should enter the order in the app. Staff should see it, pack it, dispatch it, and create DM or sale.

### Order Flow

```
Owner creates order
Owner selects customer and items
Owner sees previous selling rates
Owner sets final rate
Owner sends order to staff
Staff packs items
Staff reports shortage if needed
Staff dispatches
Staff creates DM or sale
Payment is recorded
Order is completed
```

### Advance Payment Against Order

Customer may pay an advance before goods are dispatched. This is tracked as follows:

```
Owner or staff records payment against order before dispatch.
Payment is linked to order_id in payments table.
Order shows paid_amount and balance_amount.
When DM or sale is created from order, advance amount carries forward.
No second stock reduction happens when DM/sale is created from an already-advanced order.
```

### Order Fields

```
Order number (format: ORD-YYYYMMDD-001)
Shop ID
Customer ID
Created by owner
Assigned staff ID optional
Order date
Expected dispatch date
Priority
Status
Payment status
Subtotal
Discount amount
Total amount
Paid amount (includes any advance received)
Balance amount
Owner notes
Staff notes
Created at
Updated at
Cancelled at optional
Cancel reason optional
```

### Order Statuses

```
Draft
Confirmed
Sent to Staff
Packing
Partially Packed
Packed
Partially Dispatched
Dispatched
DM Created
Converted to Sale
Partially Paid
Fully Paid
Completed
Cancelled
On Hold
```

### Order Item Fields

```
Order ID
Item ID
Quantity ordered
Quantity packed
Quantity dispatched
Quantity pending
Rate
Discount amount
Line total
Status
Price source
Last customer rate snapshot
Recent market/customer rate snapshot
```

### Order Item Statuses

```
Pending
Available
Packed
Partially Packed
Shortage
Dispatched
Returned
Cancelled
```

### Stock Rule

```
Order created → stock not reduced.
Packing started → stock checked.
DM created or Sale confirmed → stock reduced.
Partial dispatch → stock reduced only for dispatched quantity.
```

### Acceptance Criteria

```
Owner can create order.
Owner can assign order to staff.
Owner or staff can record advance payment against order.
Staff can see order in Orders to Pack.
Staff can pack full or partial quantity.
Staff can report shortage.
Staff can create DM from order.
Staff can convert order to sale.
Order keeps full activity history.
```

---

## 17. Module 7: Packing and Dispatch

### Packing Flow

```
Staff opens Orders to Pack.
Staff opens order detail.
Staff taps Start Packing.
Staff marks each item packed.
If shortage, staff enters available quantity and reason.
Staff marks order Packed or Partially Packed.
```

### Dispatch Flow

```
Staff selects packed items.
Staff enters dispatched quantity.
Staff creates DM or Sale.
Staff uploads dispatch proof/photo optional.
System updates order status.
System updates stock through DM or sale.
```

### Dispatch Fields

```
Dispatch ID
Order ID
DM ID optional
Sale ID optional
Customer ID
Shop ID
Dispatched by
Dispatch date
Status
Proof image optional
Notes
```

### Dispatch Item Fields

```
Dispatch ID
Order item ID
Item ID
Quantity dispatched
```

### Acceptance Criteria

```
Partial dispatch is allowed.
Dispatch can create DM.
Dispatch can create Sale.
Dispatch stores proof if uploaded.
Owner can see packed, pending, and dispatched quantity.
```

---

## 18. Module 8: Price History and Rate Suggestion

### Purpose

Owner should know:

```
Previously sold this item to this customer at what rate?
Previously sold this item to other customers at what rate?
What was the last selling price?
What was the lowest/highest recent price?
Who sold it and when?
```

### Price History Sources

Use transaction history from:

```
Sale items
DM items
Order items
```

### When Owner Creates Order

After selecting customer and item, show:

```
Default selling price
Last sold rate to this customer
Average rate to this customer
Lowest rate to this customer
Highest rate to this customer
Last 5 rates to this customer
Recent rates to other customers
Current stock
Pending order quantity
Pending DM quantity
```

### Example Display

```
Item: Cement Bag
Customer: ABC Traders

Last sold to this customer:
₹390 on 12 May 2026
Qty: 20

Same customer history:
Average: ₹385
Lowest: ₹375
Highest: ₹400

Other customer recent rates:
₹395 - XYZ Traders - 10 May 2026
₹380 - PQR Store  - 08 May 2026
₹405 - LMN Agency - 05 May 2026

Suggested rate: ₹390
```

### Staff Rate Change Request

Staff cannot directly change the owner-set rate on an order. Staff can request a rate change.

Rate change request fields:

```
Order item ID
Current rate (owner-set)
Suggested rate (staff-proposed)  ← NEW
Reason
Requested by
Status
```

Owner sees the suggested rate along with the reason and can approve or reject.

### Staff Price Rules

```
Owner sees full price history.
Staff sees only final owner-set rate.
Staff cannot change owner-created order rate.
Staff can request rate change and must provide a suggested rate and reason.
Owner can approve or reject rate change.
```

### Acceptance Criteria

```
Owner can view customer-item price history.
Owner can view recent rates across other customers.
Owner can set custom rate.
Actual rate is saved on every order/sale/DM item.
Staff cannot secretly change rate.
Staff rate change request must include suggested rate.
Owner sees suggested rate when reviewing request.
```

---

## 19. Module 9: Walk-in / Counter Sale

### Purpose

For customers who walk in without a registered account, staff should not be forced to create a customer record. This shortcut removes friction for fast counter transactions.

### Walk-in Sale vs Regular Sale

| | Walk-in Sale | Regular Sale |
|---|---|---|
| Customer required | No | Optional |
| Customer name shown | "Walk-in Customer" | Customer name |
| Price history shown | No | Yes (owner only) |
| Credit/pending allowed | No | Yes |
| All payment modes | Yes | Yes |

### Walk-in Sale Flow

```
Staff taps New Sale.
Staff sees two options: Walk-in / Counter Sale and Regular Sale.
Staff taps Walk-in / Counter Sale.
Staff selects item and quantity.
System shows rate.
Staff records payment (cash, UPI, card, or mixed).
Sale is completed.
```

### Rules

```
Walk-in sale must be fully paid at time of sale.
Walk-in sale cannot have pending/credit payment.
Walk-in sale does not require customer selection.
Walk-in sale is stored with customer_id = null.
```

### Acceptance Criteria

```
Staff can complete a walk-in sale in under 30 seconds.
Walk-in sale appears in daily summary.
Walk-in sale reduces stock.
Walk-in sale supports split payment (cash + UPI etc.) but not credit.
```

---

## 20. Module 10: Sales

### Sale Types

```
Walk-in / Counter sale (no customer required, fully paid)
Normal sale
Credit/pending sale
Mixed payment sale
Sale from order
Sale from DM
Return/refund
```

### Sale Fields

```
Sale ID
Sale number (format: SAL-YYYYMMDD-001)
Shop ID
Staff ID
Customer ID optional
Order ID optional
DM ID optional
Items
Subtotal
Discount amount
Total amount
Paid amount
Balance amount
Due date optional (for credit/pending sales)
Payment status
Sale status
Created at
Updated at
Cancelled at optional
Cancel reason optional
```

### Sale Statuses

```
Draft
Confirmed
Partially Paid
Paid
Pending Payment
Cancelled
Returned
```

### Due Date Rule

```
If payment_status is Pending Payment or Partially Paid, due_date can be set.
Due date appears in customer outstanding view.
Overdue sales (past due date, not fully paid) are flagged on owner dashboard.
```

### Staff Sale Flow

```
Tap New Sale.
Choose Walk-in or Regular.
Select customer (Regular only).
Select item.
Enter quantity.
System shows rate.
Add payment.
Complete sale.
```

### Acceptance Criteria

```
Sale must have at least one item.
Sale reduces stock.
Sale supports split payment.
Credit sale must have due_date (optional but recommended).
Owner sees overdue sales flagged.
Owner sees sale instantly.
Staff can request correction but cannot directly edit old sale.
```

---

## 21. Module 11: DM / Unbilled Sale

### Meaning

DM is used when goods leave the shop but final bill/payment is pending or incomplete.

### DM Use Cases

```
Goods sent before final payment
Goods dispatched from owner order
Customer takes goods on credit
Final bill to be made later
Partially paid delivery
```

### DM Fields

```
DM number (format: DM-YYYYMMDD-001)
Shop ID
Order ID optional
Staff ID
Customer ID
Customer name
Customer phone optional
Customer address optional
Items
Quantity
Rate
Estimated amount
Paid amount
Balance amount
Expected payment date
Reason
Status
Created at
Updated at
Closed at optional
```

### DM Statuses

```
Created
Dispatched
Delivered
Partially Paid
Fully Paid
Converted to Sale
Returned
Cancelled
Overdue
```

### DM Stock Rule

```
DM created → stock reduces immediately.
DM returned/cancelled → stock comes back.
DM converted to sale → no second stock reduction.
```

### DM Payment Logic

```
DM can have multiple payment lines.
DM can be partially paid.
DM can be paid later.
DM supports cash, UPI, card, bank, cheque, credit, and mixed payment.
```

### Acceptance Criteria

```
Staff can create DM directly.
Staff can create DM from order.
Owner sees pending DM.
DM reduces stock.
DM supports split payment.
DM can be closed only when paid, converted, returned, or cancelled with reason.
Overdue DM (past expected payment date) is flagged on owner dashboard.
```

---

## 22. Module 12: Split / Mixed Payment

### Purpose

Customer can pay using multiple payment modes for one bill.

Example:

```
Bill amount: ₹1,000

Payment:
₹400 Cash
₹600 UPI
```

System stores:

```
Sale #SAL-20260526-001
Total: ₹1,000
Paid: ₹1,000
Balance: ₹0
Status: Paid

Payment lines:
1. Cash ₹400
2. UPI ₹600
```

### Supported Payment Modes

```
Cash
UPI
Card
Bank Transfer
Cheque
Credit/Pending
Advance Payment
Refund
```

### Payment Rules

```
One sale/DM/order can have multiple payment lines.
Paid amount = sum of payment lines.
Balance = total amount - paid amount.
Cash affects cash closing.
UPI/card/bank go to payment verification.
Cheque goes to cheque lifecycle.
Credit/pending becomes customer outstanding.
Overpayment not allowed in MVP.
Walk-in sale cannot use Credit/Pending mode.
```

### Payment Statuses

```
Recorded
Pending Verification
Verified
Mismatch
Cancelled
Refunded
```

### Sale/DM Payment Statuses

```
Unpaid
Partially Paid
Paid
Overpaid
Refunded
Cancelled
```

### Staff UI

```
Bill Total: ₹1,000
Paid: ₹400
Balance: ₹600

Added:
Cash ₹400

Add Payment:
Cash | UPI | Card | Bank | Cheque | Pending
```

### Acceptance Criteria

```
Staff can record ₹400 cash + ₹600 UPI.
Staff can record ₹500 cash + ₹300 card + ₹200 pending.
System prevents total payment above bill amount.
Cash part appears in cash closing.
Non-cash part appears in payment verification.
Walk-in sale blocks Pending option.
```

---

## 23. Module 13: Cash Payment

### Fields

```
Amount
Sale/DM/Order link
Customer optional
Cash session ID
Collected by
Created at
Note optional
```

### Rule

```
Cash payment increases expected closing cash.
```

### Acceptance Criteria

```
Cash appears in daily cash summary.
Cash appears in counter/day closing.
Cash can be linked to sale, order, or DM.
```

---

## 24. Module 14: UPI Payment

### Fields

```
Amount
UPI app / QR name optional
UTR/reference number
Screenshot optional
Sale/DM/Order link
Recorded by
Verification status
```

### Statuses

```
Recorded
Pending Verification
Verified
Mismatch
Cancelled
Reversed
```

### Acceptance Criteria

```
UPI does not affect cash drawer.
UPI appears in owner verification list.
Owner can mark verified/mismatch.
```

---

## 25. Module 15: Card Payment

### Fields

```
Amount
Card machine/POS name
Transaction ID
Last 4 digits optional
Slip photo optional
Sale/DM/Order link
```

### Statuses

```
Recorded
Pending Settlement
Settled/Verified
Mismatch
Refunded
Cancelled
```

### Acceptance Criteria

```
Card payment appears separately from UPI.
Owner can verify card payment.
Card does not affect cash drawer.
```

---

## 26. Module 16: Bank Transfer

### Fields

```
Amount
Bank account optional
UTR/reference
Sender name optional
Screenshot optional
Sale/DM/Order link
```

### Acceptance Criteria

```
Bank transfer appears in payment verification.
Owner can mark verified/mismatch.
Bank transfer does not affect cash drawer.
```

---

## 27. Module 17: Cheque Payment

### Fields

```
Cheque number
Cheque amount
Customer name
Bank name
Branch optional
Cheque date
Received date
Deposit date optional
Clearing date optional
Cheque photo optional
Sale/DM/Order link
Notes
```

### Cheque Statuses

```
Received
Deposited
Cleared
Bounced
Returned
Cancelled
```

### Cheque Rules

```
Staff can record cheque received.
Owner marks cheque deposited.
Owner marks cheque cleared.
Owner marks cheque bounced.
Cheque received does not count as cleared payment until owner verifies.
Cheque does not affect cash drawer.
If cheque bounces, amount becomes customer pending again.
```

### Acceptance Criteria

```
Staff can enter cheque details.
Owner can update cheque lifecycle.
Cheque pending appears on dashboard.
Bounced cheque creates alert.
Cheque cleared updates payment verification.
```

---

## 28. Module 18: Credit / Pending Payment

### Use Cases

```
Customer pays later.
Sale is partially paid.
Order is partially paid.
DM is unpaid or partially paid.
Cheque bounces and amount becomes pending.
```

### Fields

```
Customer ID
Sale/DM/Order ID
Pending amount
Due date optional
Note
Status
Created at
```

### Statuses

```
Pending
Partially Paid
Paid
Overdue
Cancelled
```

### Acceptance Criteria

```
Unpaid balance becomes customer pending.
Owner can see customer-wise pending amount.
Overdue outstanding (past due_date) is flagged on owner dashboard.
Staff can collect later payment.
Later payment can be cash, UPI, card, bank, cheque, or mixed.
```

---

## 29. Module 19: Stock Management

### Stock Movement Types

```
Opening Stock
Stock In
Stock Out
Sale
DM
Order Dispatch
Return
Damage/Loss
Manual Adjustment
```

### Stock Movement Fields

```
Movement ID
Shop ID
Item ID
Quantity in
Quantity out
Movement type
Reference type optional
Reference ID optional
Reason
Created by
Approved by optional
Created at
```

### Rules

```
Every stock change creates stock ledger entry.
Do not directly overwrite stock silently.
Sale reduces stock.
DM reduces stock.
Dispatch via DM/sale reduces stock.
Return increases stock.
Damage/loss requires reason.
Manual adjustment is visible to owner.
```

### Acceptance Criteria

```
Owner sees current stock.
Owner sees stock movement history.
Staff can add stock in/out.
Staff can record damage/loss.
Low stock appears on dashboard.
```

---

## 30. Module 20: Counter / Day Closing

### Purpose

At day end, staff closes the shop/counter. System compares expected cash and actual cash.

### Cash Session Fields

```
Session ID
Shop ID
Staff ID
Opening cash
Opening time
Closing time
Expected cash
Actual cash
Cash handover amount
Other deductions amount optional
Other deductions reason optional
Difference
Difference reason
Status
Reviewed by owner
Reviewed at
```

### Expected Cash Formula

```
Expected Closing Cash =
  Opening Cash
+ Cash Sales
+ Cash Received against DM
+ Cash Received against Orders
+ Cash Received against Pending/Customer Credit
- Cash Refunds
- Other Deductions (manual entry with reason)
- Cash Handover/Deposit
```

> Note: A full Expense module is not in MVP. Cash expenses are handled as "Other Deductions" — staff enters a total amount and a free-text reason during day closing. This avoids scope creep while keeping cash reconciliation accurate.

UPI, card, bank transfer, and cheque do not affect physical cash.

### Closing Flow

```
Staff taps Close Day.
System shows expected cash.
Staff enters actual cash.
Staff enters other deductions amount and reason (if any).
Staff enters cash handover/deposit.
If mismatch exists, reason is required.
Owner reviews and approves/rejects.
```

### Acceptance Criteria

```
Day cannot close without actual cash.
Mismatch requires reason.
Owner sees mismatch.
Locked day cannot be directly edited.
Other deductions are visible in daily summary.
```

---

## 31. Module 21: Payment Verification

### Purpose

Owner verifies non-cash payments.

### Verification Buckets

```
UPI pending
Card pending
Bank pending
Cheque pending
Mismatch
Verified
```

### Owner Actions

```
Mark verified
Mark mismatch
Add note
Upload proof optional
Mark cheque deposited
Mark cheque cleared
Mark cheque bounced
```

### Acceptance Criteria

```
Owner can filter pending payments.
Owner can verify or mark mismatch.
Mismatch appears in daily summary.
Staff cannot verify own non-cash payment.
```

---

## 32. Module 22: Correction Requests

### Purpose

Staff can make mistakes, but they should not silently edit records.

### Flow

```
Staff opens sale/payment/DM/order/stock entry.
Staff taps Request Correction.
Staff enters reason.
Owner receives request.
Owner approves or rejects.
If approved, system creates adjustment.
Original record remains visible.
```

### Fields

```
Entity type
Entity ID
Requested change
Reason
Requested by
Approved/rejected by
Status
Created at
```

### Statuses

```
Pending
Approved
Rejected
Applied
Cancelled
```

### Acceptance Criteria

```
Staff cannot directly edit old entries.
Owner sees all correction requests.
Audit log stores old and new values.
```

---

## 33. Module 23: Notifications

### Purpose

Key events should trigger in-app notifications. Push notification infrastructure (FCM etc.) is not in Sprint 1 — this covers in-app notification feed only initially.

### Notification Triggers

| Event | Who Sees It |
|---|---|
| New order assigned to staff | Staff |
| Cheque bounced | Owner |
| Cash mismatch on day close | Owner |
| Low stock alert | Owner |
| Correction request submitted | Owner |
| Correction request approved/rejected | Staff |
| Payment verification pending | Owner |
| Rate change request submitted | Owner |
| Rate change request approved/rejected | Staff |
| DM overdue (past expected payment date) | Owner |
| Credit sale overdue (past due date) | Owner |

### Notification Fields

```
Notification ID
User ID
Shop ID
Trigger event
Entity type
Entity ID
Message
Read status
Created at
```

### Acceptance Criteria

```
Owner sees all relevant alerts in notification feed.
Staff sees their own alerts.
Notifications link to the relevant record.
Read/unread state is tracked.
```

---

## 34. Module 24: Daily Summary

### Purpose

Daily operational report for owner. No Tally integration in MVP.

### Sections

```
Shop details
Date
Opening cash
Orders created
Orders packed
Orders dispatched
Orders converted to DM
Orders converted to sale
Sales summary
Walk-in sale summary
Payment summary
Split payment summary
Cash summary
UPI summary
Card summary
Bank transfer summary
Cheque summary
Credit/pending summary
Advance payments received
DM summary
Stock movement summary
Other deductions / cash expenses
Cash mismatch
Payment mismatch
Overdue sales and DM
Staff activity
Correction requests
Rate change requests
Owner review
```

### Summary Status

```
Draft
Generated
Reviewed
Locked
Exported
```

### Locking Rule

```
Once daily summary is locked, staff cannot change that day's entries.
Any later correction creates an adjustment entry.
```

### Export Formats

```
PDF
CSV
Excel later
```

### Acceptance Criteria

```
Owner can generate daily summary.
Owner can lock daily summary.
Owner can export PDF/CSV.
Locked summary cannot be silently changed.
```

---

## 35. Module 25: Owner Dashboard

### Dashboard Cards

```
Today total sales
Today walk-in sales
Today orders
Orders to pack
Orders dispatched
Pending DM amount
Overdue DM amount
Pending order amount
Customer pending amount
Overdue customer outstanding
Cash collected
UPI collected
Card collected
Bank transfer collected
Cheque received
Cheque pending
Cheque bounced
Stock alerts
Cash mismatch
Payment verification pending
Rate change requests pending
Correction requests pending
Daily summary status
```

### Filters

```
Today
Yesterday
Custom date
Shop
Staff
Customer
Payment mode
Order status
DM status
Item
```

### Acceptance Criteria

```
Owner sees key business numbers on first screen.
Owner can filter shop-wise.
Owner can drill down into order, sale, payment, DM, and stock records.
Overdue items are visually highlighted.
```

---

## 36. Module 26: Staff Today Summary

Staff sees only their own today's work.

```
My orders packed
My orders dispatched
My sales today
My walk-in sales today
My cash collected
My UPI recorded
My cheque received
My DM created
My stock entries
Day close status
```

Staff does not see:

```
Profit
Other shop data
Full owner reports
All staff data
Full customer price history
```

---

## 37. Module 27: Audit Log

### Logged Actions

```
Login
Order created
Order sent to staff
Advance payment recorded against order
Packing started
Item packed
Shortage reported
Dispatch created
Sale created
Walk-in sale created
Payment added
Cheque added
Cheque status changed
DM created
Stock movement added
Opening stock set
Cash session closed
Correction requested
Correction approved/rejected
Rate change requested
Rate change approved/rejected
Payment verified
Notification sent
Daily summary locked
```

### Fields

```
User ID
Role
Shop ID
Action
Entity type
Entity ID
Old value
New value
Reason
Timestamp
Device info optional
```

### Acceptance Criteria

```
Owner can view audit trail.
Staff cannot delete audit logs.
Deleted/cancelled records remain traceable.
```

---

## 38. Data Model

### Main Tables

```
users
roles
shops
staff_shop_access

customers

items
item_categories
stock_ledger

orders
order_items
order_events
packing_tasks
dispatches
dispatch_items

sales
sale_items

delivery_memos
delivery_memo_items

payments
payment_details

cash_sessions
cash_movements

credit_outstandings

correction_requests
rate_change_requests
audit_logs
notifications

daily_summaries
daily_summary_exports
```

### users

```
id
name
mobile
email nullable
password_hash
role
status
created_at
updated_at
```

### shops

```
id
name
code
city
address
owner_id
opening_cash
opening_stock_locked boolean default false
status
created_at
updated_at
```

### customers

```
id
shop_id
name
phone nullable
address nullable
city nullable
gstin nullable
credit_limit nullable
outstanding_amount
notes nullable
status
created_at
updated_at
```

### items

```
id
shop_id
name
sku nullable
category_id nullable
unit
default_selling_price
minimum_allowed_price nullable
purchase_price nullable
mrp nullable
minimum_stock
status
created_at
updated_at
```

### orders

```
id
order_number
shop_id
customer_id
created_by
assigned_staff_id nullable
order_date
expected_dispatch_date nullable
priority
status
payment_status
subtotal
discount_amount
total_amount
paid_amount
balance_amount
owner_notes nullable
staff_notes nullable
created_at
updated_at
cancelled_at nullable
cancel_reason nullable
```

### order_items

```
id
order_id
item_id
quantity_ordered
quantity_packed
quantity_dispatched
quantity_pending
rate
discount_amount
line_total
status
price_source
last_customer_rate_snapshot nullable
recent_rate_snapshot nullable
created_at
updated_at
```

### order_events

```
id
order_id
event_type
old_status nullable
new_status nullable
note nullable
created_by
created_at
```

### packing_tasks

```
id
order_id
shop_id
staff_id
status
started_at nullable
completed_at nullable
notes nullable
```

### dispatches

```
id
order_id
dm_id nullable
sale_id nullable
customer_id
shop_id
dispatched_by
dispatch_date
status
proof_image_url nullable
notes nullable
created_at
```

### dispatch_items

```
id
dispatch_id
order_item_id
item_id
quantity_dispatched
```

### sales

```
id
sale_number
shop_id
staff_id
customer_id nullable
order_id nullable
dm_id nullable
is_walkin boolean default false
subtotal
discount_amount
total_amount
paid_amount
balance_amount
due_date nullable
payment_status
sale_status
created_at
updated_at
cancelled_at nullable
cancel_reason nullable
```

### sale_items

```
id
sale_id
item_id
quantity
rate
discount_amount
total_amount
```

### delivery_memos

```
id
dm_number
shop_id
order_id nullable
staff_id
customer_id nullable
customer_name
customer_phone nullable
estimated_amount
paid_amount
balance_amount
status
expected_payment_date nullable
reason nullable
created_at
updated_at
closed_at nullable
```

### delivery_memo_items

```
id
dm_id
item_id
quantity
rate
discount_amount
total_amount
```

### payments

```
id
shop_id
sale_id nullable
dm_id nullable
order_id nullable
customer_id nullable
payment_mode
amount
status
verification_status
received_by
received_at
verified_by nullable
verified_at nullable
reference_number nullable
proof_image_url nullable
notes nullable
created_at
updated_at
```

### payment_details

```
id
payment_id
upi_reference nullable
card_txn_id nullable
bank_utr nullable
cheque_number nullable
cheque_bank_name nullable
cheque_branch nullable
cheque_date nullable
cheque_received_date nullable
cheque_deposit_date nullable
cheque_clear_date nullable
cheque_status nullable
```

### stock_ledger

```
id
shop_id
item_id
movement_type
quantity_in
quantity_out
reference_type nullable
reference_id nullable
reason nullable
created_by
created_at
```

### cash_sessions

```
id
shop_id
staff_id
opening_cash
expected_cash
actual_cash nullable
cash_handover nullable
other_deductions_amount nullable
other_deductions_reason nullable
difference nullable
difference_reason nullable
status
opened_at
closed_at nullable
reviewed_by nullable
reviewed_at nullable
```

### rate_change_requests

```
id
order_item_id
current_rate
suggested_rate
reason
requested_by
status
approved_by nullable
approved_at nullable
rejected_reason nullable
created_at
updated_at
```

### correction_requests

```
id
entity_type
entity_id
requested_change_json
reason
requested_by
status
approved_by nullable
approved_at nullable
rejected_reason nullable
created_at
updated_at
```

### notifications

```
id
user_id
shop_id
trigger_event
entity_type
entity_id
message
is_read boolean default false
created_at
```

### audit_logs

```
id
user_id
role
shop_id
action
entity_type
entity_id
old_value_json nullable
new_value_json nullable
reason nullable
device_info nullable
created_at
```

---

## 39. API Requirements

### Auth APIs

```
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/refresh
```

### Shop APIs

```
GET   /shops
POST  /shops
PATCH /shops/:id
POST  /shops/:id/set-opening-stock
```

### Customer APIs

```
POST  /customers
GET   /customers
GET   /customers/:id
PATCH /customers/:id
GET   /customers/:id/outstanding
GET   /customers/:id/price-history
```

### Item APIs

```
GET   /items
POST  /items
PATCH /items/:id
GET   /items/:id/stock
GET   /items/:id/price-history
GET   /items/:id/recent-rates
GET   /items/:id/customer-rate-suggestion?customerId=
```

### Order APIs

```
POST  /orders
GET   /orders
GET   /orders/:id
PATCH /orders/:id
POST  /orders/:id/confirm
POST  /orders/:id/assign-staff
POST  /orders/:id/start-packing
POST  /orders/:id/mark-item-packed
POST  /orders/:id/report-shortage
POST  /orders/:id/create-dm
POST  /orders/:id/convert-to-sale
POST  /orders/:id/dispatch
POST  /orders/:id/add-payment
POST  /orders/:id/cancel
```

### Packing APIs

```
GET  /packing/tasks
GET  /packing/tasks/:id
POST /packing/tasks/:id/start
POST /packing/tasks/:id/complete
```

### Sale APIs

```
POST /sales
GET  /sales
GET  /sales/:id
POST /sales/:id/request-correction
POST /sales/:id/request-cancel
```

### DM APIs

```
POST /delivery-memos
GET  /delivery-memos
GET  /delivery-memos/:id
POST /delivery-memos/:id/add-payment
POST /delivery-memos/:id/mark-returned
POST /delivery-memos/:id/close
POST /delivery-memos/:id/request-cancel
```

### Payment APIs

```
POST /payments
GET  /payments
GET  /payments/:id
POST /payments/:id/verify
POST /payments/:id/mark-mismatch
```

### Cheque APIs

```
GET  /cheques
POST /cheques/:id/mark-deposited
POST /cheques/:id/mark-cleared
POST /cheques/:id/mark-bounced
POST /cheques/:id/mark-returned
```

### Stock APIs

```
POST /stock/movements
GET  /stock/movements
GET  /stock/current
```

### Cash Session APIs

```
POST /cash-sessions/open
GET  /cash-sessions/current
POST /cash-sessions/:id/close
POST /cash-sessions/:id/review
```

### Rate Change Request APIs

```
POST /rate-change-requests
GET  /rate-change-requests
POST /rate-change-requests/:id/approve
POST /rate-change-requests/:id/reject
```

### Notification APIs

```
GET  /notifications
POST /notifications/:id/mark-read
POST /notifications/mark-all-read
```

### Daily Summary APIs

```
POST /daily-summaries/generate
GET  /daily-summaries
GET  /daily-summaries/:id
POST /daily-summaries/:id/lock
GET  /daily-summaries/:id/export/pdf
GET  /daily-summaries/:id/export/csv
```

---

## 40. Validation Rules

### Sale Validation

```
Sale must have at least one item.
Quantity must be greater than zero.
Stock must be available unless owner allows negative stock.
Paid amount cannot exceed sale total in MVP.
Balance is calculated automatically.
Walk-in sale cannot have Credit/Pending payment mode.
```

### Order Validation

```
Order must have customer.
Order must have at least one item.
Each item must have quantity and rate.
Owner-created order can be sent to staff only after confirmation.
Staff cannot change owner rate directly.
Advance payment cannot exceed order total.
```

### Payment Validation

```
Payment amount must be greater than zero.
Payment line must belong to sale, DM, order, or customer.
Cash payment requires active cash session.
UPI/card/bank payment may require reference based on shop setting.
Cheque payment requires cheque number, bank name, cheque date, and amount.
```

### DM Validation

```
DM must have customer name.
DM must have at least one item.
DM must reduce stock.
DM cannot be deleted.
Cancelled DM requires reason.
Returned DM adds stock back.
```

### Rate Change Request Validation

```
Suggested rate is required.
Suggested rate must be greater than zero.
Reason is required.
Only owner can approve or reject.
```

### Cash Closing Validation

```
Actual cash is required.
Difference reason is required if mismatch exists.
Staff cannot close day if required sale/payment records are incomplete.
Other deductions require reason if amount is entered.
Owner can lock after review.
```

### Opening Stock Validation

```
Opening stock can only be entered once per item per shop.
After first transaction in that shop, opening stock is locked.
Quantity must be zero or greater.
```

---

## 41. Screen List

### Common Screens

```
Login
Profile
Notifications
```

### Staff Screens

```
Staff Home
Orders to Pack
Order Detail
Packing Screen
Dispatch Screen
Walk-in Sale Screen
New Sale (Regular)
Add Payment
Split Payment
Create DM
DM Detail
Take Payment
Stock Entry
Stock Movement History
Close Day
Today Summary
Request Correction
Request Rate Change
```

### Owner Screens

```
Owner Dashboard
Shop Selector
Opening Stock Entry
New Order
Order List
Order Detail
Rate Change Requests
Price History
Customer Detail
Customer Outstanding
Sales List
Sale Detail
Payment Verification
Cheque List
Cheque Detail
DM List
DM Detail
Stock Dashboard
Stock Movement
Cash Closing Review
Correction Requests
Notifications
Daily Summary
Export Summary
Settings
Staff Management
Item Management
Customer Management
```

---

## 42. UX Requirements

### Staff UX Principles

```
Big buttons
Simple language
Minimal typing
Auto-calculate totals
Show balance clearly
Show payment breakup clearly
Use icons
Use success confirmation
Hindi/English labels if needed
No accounting terms
```

Avoid words:

```
Debit
Credit ledger
Voucher
Contra
Journal
```

Use simple words:

```
Sale
Cash received
UPI received
Cheque received
Customer pending
Stock in
Stock out
Pack order
Dispatch
Close day
Walk-in customer
Suggested price
```

### Payment UX

Always show:

```
Bill Total
Paid
Balance
Payment breakup
```

Example:

```
Bill Total: ₹1,000
Paid: ₹400
Balance: ₹600

Added:
Cash ₹400

Add:
UPI ₹600
```

### Walk-in Sale UX

Staff sees two clear options after tapping New Sale:

```
[Walk-in / Counter Sale]   ← No customer needed, fully paid
[Regular Sale]             ← Select customer, supports credit
```

### Owner Order UX

When owner adds item to order:

```
Show current stock.
Show default price.
Show last sold rate to this customer.
Show recent rates to other customers.
Show pending order quantity.
Show pending DM quantity.
Allow owner to set final rate.
```

### Rate Change Request UX (Staff)

```
Staff sees current rate (set by owner).
Staff cannot type in rate field directly.
Staff taps "Request Rate Change".
Staff enters suggested rate.
Staff enters reason.
Staff submits.
Owner sees request with suggested rate and reason.
```

---

## 43. Reports

### MVP Reports

```
Daily sales report
Walk-in sale summary
Order report
Orders to pack report
Dispatch report
Payment mode report
Split payment report
Advance payment report
Cash closing report
UPI/card/bank verification report
Cheque pending report
Cheque bounced report
Customer pending report
Overdue outstanding report
DM pending report
Stock movement report
Low stock report
Price history report
Rate change request report
Staff activity report
Correction request report
Daily summary export
```

---

## 44. Security Requirements

```
JWT authentication
Password hashing
Role-based access control
Backend permission checks
Shop-level access control
Soft delete only
Audit log for sensitive actions
No direct edit after daily summary lock
Owner-only price history access
Owner-only payment verification
Owner-only cheque clearing/bounce status
Owner-only opening stock lock after first transaction
```

---

## 45. Non-Functional Requirements

### Performance

```
Login under 3 seconds
Item search under 1 second
Customer search under 1 second
Sale creation under 2 seconds
Walk-in sale creation under 30 seconds
Order creation under 3 seconds
Dashboard under 3 seconds
Daily summary under 5 seconds for normal shop data
```

### Reliability

```
No sale without stock validation
No DM without stock impact
No cash payment without cash session
No silent edit after daily summary lock
No deletion of financial records
Daily backup
Error logging
```

### Scalability

MVP supports:

```
Multiple shops
Two roles: Owner and Staff
10–50 staff users
10,000 items
1,000 sales/day per shop
Multiple payment lines per sale
Multiple order items per order
Customer-wise price history
```

---

## 46. Release Plan

### Sprint 1: Foundation

```
Expo app setup
Login
Owner/staff routing
RBAC from backend
Basic shop setup
React Native Paper UI setup
Notification feed (in-app only)
Record number format implementation
```

### Sprint 2: Customer, Item, Stock

```
Customer master
Item master
Opening stock entry
Current stock
Stock in
Stock out
Damage/loss
Stock ledger
```

### Sprint 3: Orders and Price History

```
Owner creates order
Customer/item price history
Rate suggestion
Rate change request with suggested rate
Send order to staff
Orders to pack
Packing status
Shortage reporting
Advance payment against order
```

### Sprint 4: Dispatch, DM, Sales

```
Dispatch from order
Create DM from order
Convert order to sale
Create walk-in sale
Create regular sale
Create direct DM
Stock impact
Due date on credit sales
```

### Sprint 5: Payments

```
Cash payment
UPI payment
Card payment
Bank transfer
Cheque entry
Split/mixed payment
Credit/pending payment
Walk-in sale payment restrictions
```

### Sprint 6: Cheque and Verification

```
Cheque lifecycle
Payment verification
Mismatch marking
Customer outstanding
Overdue DM and credit sale flagging
```

### Sprint 7: Cash Closing

```
Cash session
Close day
Expected vs actual cash
Other deductions (simplified expenses)
Mismatch reason
Owner review
```

### Sprint 8: Owner Reports

```
Owner dashboard
Order dashboard
Payment dashboard
Cheque dashboard
Stock report
Staff activity
Overdue reports
Rate change request management
Daily summary
PDF/CSV export
```

---

## 47. Success Metrics

### Owner Success

```
Owner can create order from anywhere.
Staff can see and pack owner-created order.
Owner can see previous selling rates before quoting.
Owner can see today's sales without calling staff.
Owner can see cash mismatch same day.
Owner can track every cheque.
Owner can see pending DM/unbilled sale.
Owner can see overdue outstanding clearly.
Owner can see customer pending amount.
Owner can export daily summary.
Owner can review and act on rate change requests.
```

### Staff Success

```
Staff can create walk-in sale in under 30 seconds.
Staff can create regular sale easily.
Staff can pack and dispatch order easily.
Staff can record ₹400 cash + ₹600 UPI easily.
Staff can create DM without accounting knowledge.
Staff can request rate change with suggested rate.
Staff can close day without Tally.
```

### Business Success

```
Less cash mismatch
Less untracked DM
Less stock leakage
Better order execution
Clear payment breakup
Better cheque tracking
Better customer rate control
Better advance payment tracking
Cleaner daily closing
Better owner control
Fewer untracked credit sales
```

---

## 48. Final MVP Definition

Build **one Expo mobile app** with **Owner and Staff roles**.

Owner will use it for:

```
Creating customer/party orders
Setting item rates
Viewing previous sold prices
Setting opening stock when shop is first created
Tracking packing and dispatch
Monitoring sales, DM, payments, cheque, stock, and cash
Reviewing advance payments against orders
Approving/rejecting rate change requests
Approving corrections
Locking/exporting daily summary
```

Staff will use it for:

```
Packing owner-created orders
Dispatching goods
Creating DM
Creating walk-in (counter) sales
Creating regular sales
Recording split payments
Recording cash/UPI/card/bank/cheque
Managing stock in/out
Requesting rate change with suggested rate
Closing day
```

Tally integration is not part of MVP.

The first version focuses on:

```
Owner command
Staff execution
Walk-in sale speed
Order tracking
Rate history and rate change control
Advance payment tracking
Payment breakup
Stock control
Opening stock accuracy
DM tracking
Cheque tracking
Overdue visibility
Cash closing
Daily summary
In-app notifications
Consistent record numbering
```