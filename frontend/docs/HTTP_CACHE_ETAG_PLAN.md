# HTTP Caching & ETag Revalidation Architectural Plan

**Repository**: GreenHacker420/stock-app  
**Target**: `frontend/` & `backend/`  
**Date**: August 1, 2026  

---

## 1. Candidate GET Endpoints for ETag & Conditional Revalidation

The following read endpoints are strong candidates for `ETag` generation and HTTP `304 Not Modified` responses:

1. `GET /items?shopId=...`: Master item catalog (infrequently updated relative to transaction volume).
2. `GET /customers?shopId=...`: Customer directory and basic profiles.
3. `GET /shops`: Configured retail shop outlets directory.
4. `GET /whatsapp/capability?shopId=...`: WhatsApp Cloud API integration status.
5. `GET /auth/staff`: Staff accounts list.

---

## 2. Proposed Cache-Control Policies

- **Private & Revalidate**: `Cache-Control: private, no-cache`
  - Allows client-side browser caching, but forces revalidation via `If-None-Match` on every fetch.
- **No Store (Sensitive / Unsafe)**: `Cache-Control: no-store, private`
  - Mandatory for payment verification, cash session balances, user credentials (`/auth/login`, `/auth/me`), and daily financial audit reports.

---

## 3. Proposed ETag Source Strategy

Instead of computing expensive MD5 hashes of raw database response JSON on every request:
- Use domain updated timestamps or Prisma row version numbers (e.g. `W/"item-shop1-1785507622"`).
- Aggregate max `updatedAt` timestamp across returned rows for list endpoints.

---

## 4. If-None-Match & 304 Handling Flow

1. Client sends request with header: `If-None-Match: W/"item-shop1-1785507622"`.
2. Backend computes aggregate version tag. If matching, returns `HTTP 304 Not Modified` with an empty body.
3. Client API layer retains TanStack Query cache data and updates freshness metadata without re-parsing JSON payloads.

---

## 5. CORS Exposed Headers

Express backend must explicitly expose validation headers:
```js
res.setHeader("Access-Control-Expose-Headers", "ETag, Last-Modified, X-Request-Id");
```

---

## 6. Write Concurrency (If-Match vs Expected Version)

For write operations (`PATCH /items/:id`, `POST /sales`):
- Maintain explicit `expectedVersion` or send `If-Match: W/"version"` to reject stale concurrent updates with `HTTP 412 Precondition Failed`.
