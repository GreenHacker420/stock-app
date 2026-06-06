1. Schema First

Before touching services:

Schema
↓
Migration
↓
Types
↓
Services
↓
Routes
↓
Tests

Never:

Service
↓
Schema later
2. No String Statuses

Never:

status String
type String
sourceType String
role String

Use enums instead. Enums provide stronger validation and make schemas more self-documenting than free-form strings.

Example:

enum OrderStatus {
  DRAFT
  PACKING
  DISPATCHED
  COMPLETED
}
3. No Magic Strings In Code

Bad:

if (sale.status === "PAID")

Good:

if (sale.status === SaleStatus.PAID)
4. Money Must Go Through One Layer

All monetary operations:

Sale
Payment
DM
Outstanding
Advance
CashSession

must use:

money()
add()
sub()
mul()
div()

Only.

No:

+
-
*
/

on financial values.

5. Every State Machine Must Be Explicit

Every entity needs:

Allowed states
Allowed transitions
Forbidden transitions

Example:

PENDING
↓
PARTIAL
↓
PAID

Cannot:

PAID
↓
PENDING

without reversal.

6. Every Business Event Needs Audit Trail

If system changes:

Money
Stock
Debt
Price
Status

then:

AuditLog required
7. Every Service Must Have Transaction Boundary

Example:

await prisma.$transaction(...)

for:

Sale Creation
Payment Allocation
Cheque Bounce
DM Conversion
Cancellation
Returns
Stock Reservation
8. No Nullable Foreign Keys Without Reason

Whenever Gemini adds:

fooId String?

it must explain:

Why nullable?
What business state requires null?
9. Every Table Needs Ownership Rules

For every new table define:

Who creates?
Who updates?
Who approves?
Who deletes?

Before implementation.

10. Every New Table Needs Index Review

Gemini must explain:

Why index exists
Query pattern
Expected usage

Not just randomly add indexes.

What Should Be Investigated Next?

After debt ledger, do not jump to React Native optimizations yet.

The next highest-risk business area is:

Inventory Reservation

Current risk:

Order Created
↓
Packing
↓
Stock Not Reserved
↓
Walk-in Sale
↓
Order Fails

This is still a real ERP correctness issue.

Priority Roadmap
Phase A

Inventory Reservation

Define:

Physical Stock
Reserved Stock
Packed Stock
Available Stock

and prove:

Available
=
Physical
-
Reserved
Phase B

Delivery Memo → Sale Conversion

Audit found this incomplete.

Need:

DM
↓
Invoice
↓
Outstanding
↓
Payments

full flow.

Phase C

Correction Engine

Current:

Approve
↓
Nothing happens

Need:

Approve
↓
Reversal
↓
Adjustment
↓
Audit
Phase D

Returns

Currently not deeply analyzed.

Need:

Sale Return
DM Return
Stock Return
Payment Return
Advance Creation