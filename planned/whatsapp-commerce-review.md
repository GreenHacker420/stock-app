# WhatsApp Commerce and Catalog Review

> Audit date: 2026-06-19

## Current State

ShopControl has mature inventory, item, order, sale, delivery, and payment domains, but no WhatsApp catalog or product mapping. The webhook parser recognizes inbound `order` payloads, yet the message mapper stores them as `TEXT`. There is no catalog connection, product synchronization, product-message compiler, order snapshot, or reconciliation workflow.

## Capability Matrix

| Capability | Meta | ShopControl | Recommendation |
|---|---|---|---|
| Connect catalog to WABA/number | Commerce eligible | Missing | Tenant-scoped catalog connection |
| Catalog API read | Yes | Missing | Synchronize external catalog metadata |
| Product create/update | Catalog/Commerce APIs | Missing | Adapter and queued sync |
| Product sets/collections | Supported through catalog structures | Missing | Optional mapping after product sync |
| Single-product message | Yes | Missing | Phase 4 |
| Multi-product message | Yes | Missing | Phase 4 |
| Catalog message | Yes where eligible | Missing | Phase 4 |
| Inbound order message | Yes where commerce enabled | Partial | Normalize and persist immutable order snapshot |
| Order details/status messages | Market/capability dependent | Missing | Capability-gated adapter |
| Commerce templates | Template formats/policies | Missing | Reuse template compiler |

## Anti-Corruption Layer

Do not add Meta fields directly to core ERP models. Introduce:

```ts
interface CommerceCatalogAdapter {
  connectCatalog(input): Promise<CatalogConnection>;
  refreshCatalog(connectionId): Promise<void>;
}

interface CommerceProductAdapter {
  projectItem(itemId): Promise<CommerceProductDraft>;
  syncProduct(mappingId): Promise<SyncResult>;
}

interface CommerceOrderAdapter {
  ingestOrder(snapshot): Promise<CommerceOrder>;
  convertToErpOrder(commerceOrderId, actorId): Promise<Order>;
  publishStatus(orderId): Promise<void>;
}
```

## Data Model

Add tenant-scoped models:

- `WaCatalogConnection`: WABA, catalog ID, business portfolio, status, capability, sync timestamps.
- `WaProductMapping`: item ID, retailer ID, Meta product ID, projected fields, sync status, errors.
- `WaProductSetMapping`: optional local collection/category to Meta set mapping.
- `WaCommerceOrder`: Meta order/message IDs, customer, catalog, currency, totals, raw immutable snapshot, conversion status.
- `WaCommerceOrderItem`: retailer ID, quantity, unit price snapshot, resolved item ID.
- `WaOrderLink`: commerce order to ERP order with conversion audit.

Retailer IDs must be stable and tenant-scoped. Do not use mutable item names.

## Product Projection

The commerce projection should define:

- Title and description.
- Availability derived from sellable stock policy.
- Price and currency.
- Product URL where required.
- Image URL with stable public delivery acceptable to Meta/catalog ingestion.
- Brand, category, condition, and identifiers where relevant.
- Sync checksum.

Inventory changes should enqueue debounced availability updates rather than synchronously calling Meta inside ERP transactions.

## Inbound Order Processing

1. Normalize the `order` webhook as `ORDER`.
2. Persist the raw order snapshot idempotently.
3. Resolve catalog and product mappings.
4. Flag unknown or stale products.
5. Show an owner/staff review screen.
6. Convert through the normal ShopControl order service.
7. Record the resulting ERP order ID.
8. Never mutate inventory directly from the webhook parser.

## Outbound Commerce Messages

The message compiler should support:

- Single product.
- Multi-product sections.
- Catalog browsing message.
- Reply context.
- Optional body/footer where supported.

Validate that every product belongs to the catalog connected to the sending phone number and is currently eligible.

## Order Status

Order-details and order-status features vary by country and commerce/payments configuration. Implement behind integration capabilities:

```text
commerce.catalogMessages
commerce.orders
commerce.orderStatus
commerce.payments
```

Map ERP statuses to a narrow WhatsApp status vocabulary through configuration. Do not expose internal packing or approval states directly.

## React Native UI

### Commerce Setup

- Connected catalog status.
- Product mapping and sync health.
- Last sync, failed products, retry action.
- Category/set mapping where enabled.

### Chat

- Product picker filtered by mapped, active, in-stock products.
- Single and multi-product preview.
- Structured inbound order card.
- Link to product and ERP order.

### Order Review

- Customer and catalog identity.
- Item mapping warnings.
- Price/currency snapshot.
- Convert, reject locally, or request clarification.
- Conversion audit and duplicate protection.

## Reliability

- Queue product writes and classify Meta errors.
- Use checksums to avoid unnecessary updates.
- Reconcile all mappings periodically.
- Store raw snapshots so later catalog changes do not rewrite historical orders.
- Apply per-tenant rate limits.
- Alert on disconnected catalogs or large mapping failure rates.

## Tests

- Product projection and checksum tests.
- Stable retailer ID tests.
- Inbound order idempotency and unknown-product fixtures.
- ERP conversion transaction tests.
- Catalog mismatch rejection.
- Multi-product payload limit validation.
- Tenant isolation and queued reconciliation tests.

## References

- [Meta catalog messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#catalog-messages)
- [Meta product messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#product-messages)
- [Meta commerce platform](https://developers.facebook.com/docs/commerce-platform)

