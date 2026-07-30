# Tenant WhatsApp channel sharing

## Goal

Keep operational data branch-scoped while allowing one WhatsApp Cloud API
number to be shared by selected branches inside a tenant.

For the current production tenant:

```text
Tenant
├── Shop group: Vardaman Sales
│   ├── Branch: VS
│   └── Branch: VS-BURDI
└── Shop group: Chirag Enterprises
    └── Branch: JBP-01
```

`VS` and `VS-BURDI` share WhatsApp phone ID `1271752386017174`. Chirag is not
granted access initially, but can be granted this channel or assigned a
dedicated channel later.

The branch call number remains `9329470933`. WhatsApp uses `7400707155`.

## Invariants

1. A Meta phone number ID belongs to exactly one tenant channel.
2. A channel may be granted to any number of shops in the same tenant.
3. A user must have shop access and channel access.
4. Sales, stock, cash, customers, invoices, and UPI remain branch-scoped.
5. Conversations and messages are channel-scoped and stored once.
6. Every outbound message records the active branch as its context.
7. Incoming messages are never duplicated between branches.
8. A branch-specific channel overrides its shop-group channel, which overrides
   the tenant default channel.
9. Old Evergreen data is preserved as unassigned legacy history and excluded
   from all connected-channel queries.

## Target schema

- `Tenant`: security and data-isolation boundary.
- `TenantMember`: tenant-level user role.
- `ShopGroup`: business/brand containing operational branches.
- `Shop.tenantId` and `Shop.shopGroupId`: nullable during expansion, required
  after backfill.
- `WaIntegration.tenantId`: channel ownership.
- `WaIntegrationShopAccess`: explicit view/send/manage grant.
- `ShopGroup.defaultWaIntegrationId`: inherited group channel.
- `Tenant.defaultWaIntegrationId`: optional tenant fallback.
- `WaConversation.integrationId`: channel ownership.
- `WaConversation.contextShopId`: optional current branch assignment.
- `WaConversationCustomerLink`: customer link per branch.
- `WaMessage.contextShopId`: branch that initiated an outbound action.
- `WaWebhookEnvelope.integrationId`: durable channel routing.

## Effective-channel resolution

For an authenticated user and requested active shop:

1. Verify `StaffShopAccess`/owner access to the shop.
2. Resolve a connected shop-owned primary channel.
3. Otherwise resolve an explicit primary branch assignment.
4. Otherwise resolve `ShopGroup.defaultWaIntegrationId`.
5. Otherwise resolve `Tenant.defaultWaIntegrationId`.
6. Require a matching `WaIntegrationShopAccess` grant for inherited channels.
7. Return the effective integration and the requested shop context.

## Inbound routing

1. Evergreen forwards configured phone IDs to ShopControl.
2. ShopControl resolves `metadata.phone_number_id` to one integration.
3. Verify the Meta HMAC using that integration's app secret.
4. Persist the webhook envelope with `integrationId`.
5. Upsert the conversation by `(integrationId, customer phone)`.
6. Preserve an existing branch assignment.
7. Otherwise infer a branch only from a reply context or an unambiguous
   customer link; leave it shared/unassigned when ambiguous.
8. Publish realtime events to an integration room available to authorized
   clients.

## Mobile scope

- Active branch remains in `shop-storage`.
- Capability cache is keyed by branch and a resolver version.
- Conversations, messages, sync cursors, and media are keyed by integration.
- Drafts and pending sends include both integration and context branch.
- Switching between `VS` and `VS-BURDI` keeps the same inbox and changes only
  the branch context.
- Switching to a shop with another effective channel switches inbox scope.

## Migration and release gates

### 1. Expand

- Add nullable tenant, group, integration, access, and context columns/tables.
- Keep existing shop-scoped reads and writes working.
- Add dual-write of integration identifiers.

### 2. Backfill

- Create the current tenant.
- Create Vardaman and Chirag shop groups.
- Attach existing shops without changing their IDs.
- Preserve the existing eight conversations and 56 messages with no connected
  `integrationId`; connected-channel reads exclude these legacy rows.
- Attach approved templates and future traffic to the connected Vardaman
  integration.
- Grant Vardaman integration access to `VS` and `VS-BURDI`.
- Restore both Vardaman branch call-phone fields to `9329470933`.

### 3. Switch backend reads

- Enable effective-channel resolution.
- Route webhook processing, credential lookup, authorization, templates,
  outbound sending, and events by integration.
- Preserve compatibility responses for old mobile builds.

### 4. Switch mobile reads

- Consume effective capability fields.
- Migrate SQLite/MMKV cache keys.
- Join integration realtime rooms.
- Clear legacy shop-scoped WhatsApp fast caches once.

### 5. Contract

- Make tenant, group, and integration ownership required.
- Remove shop-only WhatsApp lookup paths and old cache keys.
- Add uniqueness and foreign-key constraints after verification.

## Verification gates

- `VS` and `VS-BURDI` resolve the same integration ID.
- Switching between them retains one conversation list.
- A send from each branch records the correct context shop.
- Chirag receives no Vardaman access without an explicit grant.
- A dedicated Chirag channel overrides any tenant fallback.
- One inbound webhook creates one envelope, conversation, and message.
- Legacy Evergreen conversations do not appear in the Vardaman inbox.
- Unauthorized cross-tenant integration IDs return resource-not-found.
- Offline drafts and pending sends retain their original branch context.

## Rollback

The expansion release does not delete or rewrite existing records. Feature
flags keep old shop-scoped resolution available until both backend and mobile
verification gates pass. Rollback disables the new resolver and leaves all
backfilled identifiers intact for a later retry.
