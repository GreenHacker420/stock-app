# ShopControl ERP: Financial & Debt Ledger Invariants

This document establishes the mathematical and logical invariants that govern the ShopControl ERP debt ledger system. These invariants must be maintained across all transactions, migrations, and reversals.

---

## 1. Debt Pending Invariants (CreditOutstanding)

For every `CreditOutstanding` record:
* **Initial Equation**:
  $$\text{pendingAmount} = \text{originalAmount} - \text{creditNoteAmount} - \text{paidAmount}$$
* **Decimal Enforcement**:
  * `originalAmount` remains constant for auditing. Reductions from returns or adjustments increment `creditNoteAmount`.
  * All fields (`originalAmount`, `pendingAmount`, `paidAmount`, `creditNoteAmount`) must be non-negative for standard debt.
  * All balance checks and comparisons must use the Prisma `Decimal` class methods (`eq()`, `gt()`, `lt()`, `lte()`, `gte()`). No float/number conversions are permitted for comparisons.
* **Status Invariants**:
  * If $\text{pendingAmount} = 0$, then status must be `PAID`.
  * If $\text{paidAmount} > 0$ and $\text{pendingAmount} > 0$, then status must be `PARTIALLY_PAID`.
  * If $\text{paidAmount} = 0$ and $\text{pendingAmount} = \text{originalAmount} - \text{creditNoteAmount}$, then status must be `PENDING`.
  * If the parent document is cancelled, status must be `CANCELLED` and `pendingAmount` must be `0`.

---

## 2. Advance Pending Invariants (CustomerAdvance)

For every `CustomerAdvance` record:
* **Initial Equation**:
  $$\text{originalAmount} = \text{pendingAmount} + \text{paidAmount}$$
* **Decimal Enforcement**:
  * All fields must be non-negative:
    $$\text{originalAmount} \ge 0, \quad \text{pendingAmount} \ge 0, \quad \text{paidAmount} \ge 0$$
  * Comparisons must use `Decimal` class methods.
* **Status Invariants**:
  * If $\text{pendingAmount} = 0$, then status must be `PAID` (fully utilized).
  * If $\text{paidAmount} > 0$ and $\text{pendingAmount} > 0$, then status must be `PARTIALLY_PAID` (partially utilized).
  * If $\text{paidAmount} = 0$ and $\text{pendingAmount} = \text{originalAmount}$, then status must be `PENDING` (unutilized).
  * If the funding payment is bounced/cancelled, status must be `CANCELLED` and `pendingAmount` must be `0`.

---

## 3. Customer Outstanding Invariants

The calculated outstanding balance for any customer $C$ at any point in time must be computed as:
$$\text{Customer Outstanding} = \sum (\text{CreditOutstanding.pendingAmount}) - \sum (\text{CustomerAdvance.pendingAmount})$$
Where:
* `CreditOutstanding` status is not `PAID` or `CANCELLED`.
* `CustomerAdvance` status is not `PAID` or `CANCELLED`.
* **Important**: The static database column `Customer.outstandingAmount` must always remain `0` in database storage. It must never be read directly for calculations; it is replaced entirely by the dynamic query aggregation above.

---

## 4. Invoice Balance Invariants (Sale & DeliveryMemo)

For any `Sale` or `DeliveryMemo` invoice:
* **Balance Equation**:
  $$\text{totalAmount} = \text{paidAmount} + \text{balanceAmount}$$
* **Authoritative Synchronization**:
  * If a `CreditOutstanding` record exists for the invoice:
    $$\text{invoice.balanceAmount} = \text{CreditOutstanding.pendingAmount}$$
    $$\text{invoice.paidAmount} = \text{invoice.totalAmount} - \text{CreditOutstanding.pendingAmount}$$
  * If no `CreditOutstanding` record exists (e.g. fully paid cash checkout):
    $$\text{invoice.balanceAmount} = 0$$
    $$\text{invoice.paidAmount} = \text{invoice.totalAmount}$$
* **Audit Trail**: Every update to these balances must be backed by a corresponding `PaymentAllocation` record in the database.

---

## 5. Payment Allocation Invariants

For any `Payment` $P$, `CreditOutstanding` $D$, and `CustomerAdvance` $A$:
* **Payment Allocation Sum**:
  $$\sum (\text{PaymentAllocation.amount where paymentId} = P.id \text{ and status = ACTIVE}) - \sum (\text{PaymentAllocation.amount where paymentId} = P.id \text{ and status = REVERSED}) \le P.amount$$
* **Reversal Invariant**:
  * A `REVERSAL` allocation must always reference the original allocation being reversed using `reversalOfId`.
  * The reversal amount must exactly equal the original allocation's amount:
    $$\text{reversalAllocation.amount} = \text{originalAllocation.amount}$$

---

## 6. SYSTEM_USER Strategy

Automated background matching, migration scripts, and auto-allocation logic must never be attributed to real physical owners or staff. 
* We define a constant system user ID `SYSTEM_USER_ID = "SYSTEM"` (or load a dedicated system user account seeded in the database).
* Any automated/system-triggered creations or ledger modifications (such as auto-allocating advances to new sales, or migrating initial balances) must set the `createdById` to `SYSTEM_USER_ID`.

---

## 7. Global Money Precision Invariant

All stored monetary values in the database must be normalized to exactly 2 decimal places.
* No float or native double types are used for financial numbers in calculations.
* Rounding is performed using the `ROUND_HALF_UP` strategy.
* Centralized money helpers in `backend/src/utils/money.js` must be used for all calculations.

---

## 8. Inventory & Returns Invariants

For all inventory and return operations:
* **Physical Stock Invariant**:
  $$\text{Physical Stock (P)} = \sum (\text{Ledger.quantityIn}) - \sum (\text{Ledger.quantityOut})$$
* **Available Stock Invariant**:
  $$\text{Available Stock (A)} = P - \text{Active Reservations} \ge 0$$
* **Packed Limit Invariant**:
  $$\text{Packed Qty} \le \text{Reserved Qty} \le \text{Original Reserved Qty}$$
* **Returns Limit Invariant**:
  $$\text{Returned Qty} \le \text{Dispatched Qty}$$
  $$\text{Refunded Amount} \le \text{Return Net Amount}$$
* **Financial Return Equation (Authoritative Credit Invariant)**:
  $$\text{Credit Note Applied} + \text{Advance Created} + \text{Refund Issued} = \text{CreditNote.amount}$$

