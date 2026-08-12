# Frontend UI Alignment Audit

## Scope

This pass aligns the existing Next.js dashboard with the repository plan without changing stable transaction or analytics business logic.

The target is a dense, operational, keyboard-first desktop product that remains usable on smaller screens. It should feel closer to a professional ERP workspace than a collection of unrelated cards and placeholder pages.

## Current issues found

### Shell

- Navigation, header, action rail, and status bar were visually independent rather than one cohesive workspace.
- Desktop navigation used a large dark active block and had no hierarchy between operational, record, and control modules.
- Mobile navigation did not have a complete route menu.
- Header displayed a hard-coded online state instead of real connection state.
- The global quick action rail and global shortcuts checked permissions but did not consistently respect feature availability.
- The status bar defaulted to Sale Entry hints on unrelated pages such as Inventory.
- Main workspace spacing was fixed rather than adapting to viewport size.

### Inventory

The previous `/inventory` page was a thin product list rather than an inventory workspace.

Problems included:

- direct `apiRequest` calls inside the page
- `any`-typed rows and guessed response shapes
- client-side filtering of only the currently loaded item page
- no use of `/items/summary`
- no distinction between physical, reserved, and available stock
- no movement history view
- no server-backed catalogue filters or pagination controls
- rows looked interactive but did not drill into item information
- missing selling price was rendered as `₹0.00`
- Stock Entry bypassed the central feature registry and looked available when it was disabled
- Sale-specific keyboard hints leaked into Inventory

## Existing backend contracts used

No new backend endpoint is required for this first UI alignment pass.

- `GET /items/summary?shopId=`
  - active products
  - categories
  - brands
  - low-stock count
  - out-of-stock count
- `GET /stock/current?shopId=`
  - physical stock
  - reserved stock
  - available stock
  - minimum stock
- `GET /items?shopId=&search=&categoryId=&brandId=&page=&limit=`
  - server-backed product catalogue search and pagination
  - item pricing, category, brand, and attached stock balances
- `GET /items/categories?shopId=`
- `GET /items/brands?shopId=`
- `GET /stock/movements?shopId=&movementType=&page=&limit=`

Stock terminology follows the backend source of truth:

- `physicalStock = quantityIn - quantityOut`
- `reservedStock = active reservations`
- `availableStock = max(0, physicalStock - reservedStock)`

## Changes in this branch

### App shell

- grouped navigation model shared by desktop and mobile navigation
- calmer active navigation treatment
- responsive mobile navigation menu
- cleaner header hierarchy and removal of fake online state
- contextual quick action rail with disabled-feature messaging
- global shortcut registration now checks both permission and feature availability
- module-aware status bar hints
- refined spacing and neutral design tokens

### Inventory operational workspace

`/inventory` now exposes three real read views:

1. Stock Position
2. Product Catalog
3. Stock Movements

It includes:

- compact summary strip
- physical / reserved / available stock separation
- stock-condition filtering over the complete `/stock/current` result
- debounced server-backed catalogue search
- category and brand server filters
- catalogue pagination
- movement-type filtering and pagination
- item detail dialog
- row keyboard navigation with Up / Down / Home / End / Enter
- explicit loading, empty, and error states
- Stock Entry CTA governed by the feature registry

## Deliberately deferred

This branch does not implement:

- Stock Entry write recovery
- Stock Transfer write recovery
- Physical Stock workflow
- inventory CSV/PDF export
- server-side stock-status filtering for paginated catalogue data
- stock-movement total count
- full cell-by-cell ARIA data-grid navigation
- category/brand mutation UI
- item create/edit/delete UI
- saved table layouts
- ETag implementation

Those should be separate vertical slices after this shell and inventory read foundation is validated.

## Validation target

Before merge, run from `frontend/`:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run test:e2e
```

Manual browser review should cover at least:

- 390 × 844
- 768 × 1024
- 1280 × 800
- 1440 × 900
- 1920 × 1080

Verify there is no page-level horizontal overflow, mobile navigation is usable, disabled writes cannot be activated, and Inventory shows real stock semantics.
