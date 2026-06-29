# Stock App - Production Checklist

This checklist provides the necessary steps for verifying, preparing, and deploying the Stock App to production.

---

## 1. Database & Schema Preparation
- [ ] **Run Database Migrations:** Ensure the PostgreSQL database is up-to-date:
  ```bash
  npx prisma migrate deploy
  ```
- [ ] **Generate Prisma Client:** Generate the TypeScript client locally and on the build server:
  ```bash
  npx prisma generate
  ```
- [ ] **Verify Prisma Schema:** Check that the schema is fully valid:
  ```bash
  npx prisma validate
  ```

---

## 2. Infrastructure Requirements
- [ ] **Redis Connection:** Ensure a running Redis instance is accessible by the backend for handling push notification queues and async outbox processing. Verify the `REDIS_URL` environment variable is set.

---

## 3. Deployment Verification Commands

### Backend Verification
- Run the full test suite in the `backend` directory:
  ```bash
  npm test
  # Run phase security, cash session, and core business tests
  node run-tests.js
  ```
- Run static parse checks on the modified services:
  ```bash
  node --check src/services/cashSession.service.js
  node --check src/services/dailySummary.service.js
  node --check src/services/correction.service.js
  node --check src/services/order.service.js
  node --check src/controllers/order.controller.js
  ```

### Mobile Verification
- Verify that TypeScript compile/types check passes completely inside the `stock` directory:
  ```bash
  npx tsc --noEmit
  ```

---

## 4. Key Business Rules (Re-verified)

### Cash drawer rule (Fix 1 / Fix 2)
* **Expected Closing Cash:** Computed dynamically as:
  `expectedClosingCash = openingCash + cashPayments - nonRejectedCashExpenses`
* **Non-rejected expenses:** Cash expenses in `PENDING` or `APPROVED` status physically reduce expectedClosingCash. `REJECTED` expenses are ignored.
* **No Day-End Deductions:** All drawer outgoings must be logged as proper `Expense` records throughout the day. The legacy "Other Deductions" inputs have been removed.

### Outstanding reversals (Fix 3)
* Cancelling a sale or delivery memo via the correction approval queue automatically reverses the customer's outstanding balance (`outstandingAmount`) inside a single database transaction.

### Order Cancellation (Fix 4)
* Owners can cancel pending orders via `POST /orders/:id/cancel`, which cancels pending packing tasks and releases all related active stock reservations.

---

## 5. Feature Status Table

| Feature Area | Status | Notes |
| :--- | :--- | :--- |
| **WhatsApp Integration** | **DISABLED** | Navigation screens are commented out; do not enable. |
| **Full GST Console** | **DISABLED** | Simple operational status (`PENDING` / `GENERATED`) only. |
| **Rate-Change UI** | **DISABLED** | Placeholder screen only. |
| **Correction UI** | **DISABLED** | Placeholder screen only. |
| **Cheque List UI** | **DISABLED** | Placeholder screen only. (Backend service is active). |
| **Audit Log UI** | **DISABLED** | Placeholder screen only. (Backend audit logging is active). |
