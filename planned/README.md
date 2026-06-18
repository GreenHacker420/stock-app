# WhatsApp Platform Architecture Dossier — Phase 0

> **Status: COMPLETE — Awaiting Implementation Approval**  
> Generated: 2026-06-18  
> Author: Antigravity Architecture Review

---

## Purpose

This dossier contains the complete architecture investigation, design decisions, and implementation plan for the next-generation WhatsApp platform inside ShopControl. 

**No code changes have been made. This is a design-only package.**

---

## Document Index

| # | Document | Contents |
|---|----------|----------|
| 01 | [Current State Analysis](./01-current-state-analysis.md) | Deep audit of all existing WA files, critical bugs, security issues, gap analysis |
| 02 | [Optimus Architecture Review](./02-optimus-architecture-review.md) | Reference implementation analysis — cache, pub/sub, broadcast, calling, flows |
| 03 | [Meta Platform Research](./03-meta-platform-research.md) | Graph API v25.0, webhooks, message types, pricing, rate limits, BSUID |
| 04 | [Flows API Research](./04-flows-api-research.md) | Flow lifecycle, CRUD API, E2EE encryption (RSA/AES-GCM), endpoint design |
| 05 | [RTC Lite Calling Research](./05-rtc-lite-calling-research.md) | UIC/BIC flows, WebRTC ICE requirements, signaling, SDP, ShopControl architecture |
| 06 | [Multi-Tenant Architecture](./06-multi-tenant-architecture.md) | Tenant resolution, async webhook processing, queue topology, shop isolation |
| 07 | [Reliability Engineering](./07-reliability-engineering.md) | DLQ, broadcast fan-out, retry matrix, outbox pattern, BullMQ configuration |
| 08 | [Database Schema Design](./08-database-schema-design.md) | Full Prisma schema: WaIntegration, WaConversation, WaMessage, WaBroadcast, WaCall |
| 09 | [Architecture Decisions](./09-architecture-decisions.md) | 15 answered design questions: Redis choice, idempotency, caching, BSUID, etc. |
| 10 | [Implementation Roadmap](./10-implementation-roadmap.md) | Phase 1-3 plan, file changes, dependencies, success criteria |

---

## Critical Bugs Found (Must Fix in Phase 1)

| Priority | Bug | File | Impact |
|----------|-----|------|--------|
| 🔴 CRITICAL | Webhook signature bypass when `appSecret = null` | `whatsapp.controller.js` | Forged webhooks accepted |
| 🔴 CRITICAL | Synchronous inbound processing (blocks 200 response) | `whatsapp.controller.js` | Meta retries → cascade failure |
| 🔴 CRITICAL | Tenant resolved from URL param (wrong pattern) | `whatsapp.controller.js` | Breaks with single webhook URL |
| 🟠 HIGH | Template sync crashes on new shops | `whatsapp.service.js` | Templates never sync |
| 🟠 HIGH | No credential cache → DB query on every webhook | `whatsapp.service.js` | Slow + expensive |
| 🟠 HIGH | No Redis adapter for Socket.IO | `index.js` | Multi-instance real-time breaks |
| 🟡 MEDIUM | Idempotency hash includes null `metaMessageId` | `whatsapp.processor.js` | Potential collision |
| 🟡 MEDIUM | No Dead Letter Queue | `whatsapp.queue.js` | Failed messages lost silently |
| 🟡 MEDIUM | WaFlow `flowId @unique` is global not per-shop | `schema.prisma` | Schema design issue |

---

## Architecture Summary Diagram

```
                              Meta Platform (v25.0)
                                      │
                           X-Hub-Signature-256
                                      │
                    POST /api/whatsapp/webhook
                                      │
                    ┌─────────────────▼──────────────────┐
                    │          Webhook Handler            │
                    │  1. Validate HMAC (from cache)     │
                    │  2. Return 200 immediately          │
                    │  3. Push to inbound queue          │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │     BullMQ: whatsapp-inbound       │
                    │  Concurrency: 10                   │
                    │  1. Resolve shopId from phoneId    │
                    │  2. parseWebhookPayload()          │
                    │  3. processWhatsAppEvent()         │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │         Redis Pub/Sub              │
                    │   wa:events:{shopId} channel       │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │   Socket.IO (Redis Adapter)        │
                    │   shop:{shopId} room               │
                    │   → All connected browsers          │
                    └─────────────────────────────────────┘


  Outbound Path:
  ┌──────────────────────────────────────────────────────┐
  │  Owner/Staff Action                                  │
  │  → POST /whatsapp/conversations/{id}/send            │
  │  → Create WaMessage (QUEUED)                        │
  │  → Add to whatsapp-outbound queue                   │
  │  → Worker: get creds (cache) → rate limit → Meta   │
  │  → Update WaMessage (SENT/FAILED)                   │
  │  → Emit via Socket.IO                               │
  └──────────────────────────────────────────────────────┘

  Broadcast Path:
  ┌──────────────────────────────────────────────────────┐
  │  whatsapp-broadcast-dispatch (1 job)                 │
  │  → Resolve audience (Customer query + filters)       │
  │  → Set Redis counter = N                            │
  │  → Fan-out: N jobs → whatsapp-broadcast-send        │
  │     → Each: send 1 message → DECR counter           │
  │     → If counter = 0: mark broadcast COMPLETE        │
  └──────────────────────────────────────────────────────┘
```

---

## Key Technology Decisions

| Concern | Technology | Rationale |
|---------|-----------|-----------|
| Queue | BullMQ + Redis | Already in use, battle-tested |
| Real-time | Socket.IO + Redis Adapter | Already in use, scaling fix |
| Cache | In-process LRU + Redis | Two-tier for hot-path optimization |
| Pub/Sub | Redis (via Socket.IO adapter) | Unified Redis infrastructure |
| Deduplication | `WaWebhookEvent` hash table | DB-backed, survives restarts |
| Encryption (Flows) | Node.js built-in crypto (RSA-OAEP + AES-128-GCM) | No new dependencies |
| Media Storage | Amazon S3 | Only supported backend; handles downloaded media expiration. |
| AI / Observability | Out of Scope | Basic logging, local BullBoard only; no AI or custom dashboard. |

---

## Next Step

Upon approval of this dossier, implementation begins with **Phase 1** as detailed in [Document 10](./10-implementation-roadmap.md).

Phase 1 task tracker will be maintained in `planned/phase1-tasks.md`.
