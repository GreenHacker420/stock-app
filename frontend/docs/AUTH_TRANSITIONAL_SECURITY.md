# Transitional Auth & Security Migration Plan

**Repository**: GreenHacker420/stock-app  
**Target**: `frontend/` & `backend/`  
**Date**: August 1, 2026  

---

## 1. Current Transitional Auth Architecture

Currently, `frontend/` utilizes a standard **Bearer Token** model matching the Expo mobile application (`stock/`). Upon successful login (`POST /auth/login`), the backend returns a signed JWT `token` and user object.

- **Storage**: The token is persisted in client `localStorage` via Zustand middleware (`useAuthStore`).
- **Authorization Header**: Sent on all API calls via `Authorization: Bearer <token>`.
- **401 Handling**: When an API call returns `401 Unauthorized`, `setUnauthorizedHandler` triggers a central logout:
  - Clears `user`, `token`, `shops`, `activeShopId` in Zustand.
  - Clears TanStack Query cache (`queryClient.clear()`).
  - Disconnects Socket.IO connection (`disconnectRealtimeSocket()`).
  - Redirects browser to `/login`.

---

## 2. Production Security Migration Plan (Target Architecture)

To achieve production-grade web security, the following backend and frontend upgrades are planned:

### A. Short-Lived Access Token + HttpOnly Refresh Cookie
- **Access Token**: Short validity (15 minutes). Held strictly in-memory (Zustand) and never written to `localStorage` or `sessionStorage`.
- **Refresh Token**: Long validity (7 days). Stored in a secure, `HttpOnly`, `SameSite=Strict`, `Path=/auth` cookie managed directly by the Express backend.

### B. Server-Side Refresh Sessions & Token Revocation
- Hashed refresh tokens stored in PostgreSQL (`RefreshTokenSession` table) with device installation ID, user agent, and IP address.
- On `/auth/logout` or security revokes, the backend invalidates the session record in PostgreSQL, preventing further refresh cycles.

### C. CSRF Protection Strategy
- Implement anti-CSRF token verification (`X-CSRF-Token` header) paired with `SameSite=Strict` cookie policies for all non-safe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).

### D. Logout & Session Termination
- `/auth/logout` revokes the refresh session server-side, clears the HttpOnly cookie, invalidates in-memory access tokens, clears TanStack Query caches, and closes Socket.IO connections.
