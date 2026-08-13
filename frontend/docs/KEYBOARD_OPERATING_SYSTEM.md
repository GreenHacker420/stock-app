# Keyboard Operating System

Shop Control has one keyboard architecture. Keys do not belong to routes; the deepest active UI context resolves a normalized key to a semantic command.

## Pipeline

`KeyboardEvent -> normalize -> target context -> indexed bindings -> when evaluation -> command guards -> command execution -> feedback`

Responsibilities are split between:

- `lib/commands`: semantic command definitions and execution.
- `lib/context`: external context-key state and compiled context expressions.
- `lib/keyboard`: normalized keys, indexed bindings, resolution, safety and diagnostics.
- `lib/focus`: the single active keyboard pointer for composite widgets.
- `lib/navigation`: ERP drill-down frames and restoration state.

There is no Tally mode, Standard mode, route-owned shortcut engine, or page-local global listener. Text editors, comboboxes, dialogs and editable cells own input before reports/pages/application contexts.

Command surfaces (right rail, status bar, command palette, buttons) must consume the same command registry and binding registry used by the resolver. A visible shortcut must therefore correspond to an executable command in the current context.

## Context ownership

Contexts are facts, not a five-value enum. Examples include `app.module`, `app.view`, `dialog.open`, `combobox.open`, `input.editable`, `grid.focused`, `report.focused`, `form.focused`, `row.activeId`, `selection.count`, `form.dirty`, `mutation.pending`, permission keys and feature keys.

Context scopes are hierarchical DOM owners. The nearest scope to `event.target` contributes the most specific values, inheriting parent values. Global application facts live in the root context service.

## Event safety

The keyboard service ignores already handled events, IME composition, unsupported repeats, and native editing/browser chords. Mutation commands must opt out of repeat. Arrow/Page navigation may opt in.

## Active pointer

Focus and selection are distinct. Every composite owns one active pointer `{ zoneId, itemId, index, columnId? }`; mouse/touch and keyboard update the same pointer. The pointer store is external and selectively subscribable.

## Drill-down restoration

ERP navigation keeps frames containing route/search params, module/view, active pointer, selection, filters, sorting, page and scroll offset. Escape performs a logical unwind through the owning command, never a global `router.back()`.

## Migration rule

Do not add `window.addEventListener("keydown", ...)` outside `KeyboardService`. Legacy transaction/table listeners are migration blockers and must be removed as each surface moves to the kernel.