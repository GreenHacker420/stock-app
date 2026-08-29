# Keyboard Operating System

The web frontend has one keyboard architecture. There are no Tally/Standard modes and no page-local global shortcut systems.

## Runtime ownership

- `KeyboardService` owns the single capture-phase `window.keydown` listener.
- `keybindingRegistry` is the source of truth for key -> command candidates.
- `commandRegistry` is the source of truth for semantic actions.
- `commandExecutor` executes commands and records feedback.
- `contextKeyService` plus focused DOM scopes determine applicability.
- `CommandPalette`, `RightActionRail`, `StatusBar`, and keyboard execution all read the same command/keybinding model.

Pages and components register semantic commands and bindings through `KeyboardRuntimeProvider`; they do not install their own global listeners.

## Context pipeline

Focused elements and ancestors may publish JSON through `data-keyboard-scope`. `focus-context-service` composes those scopes with application context and editable-input context. `when` expressions support negation, conjunction/disjunction, grouping, equality/inequality, booleans, numbers, null/undefined, and quoted/unquoted literals.

Important examples include:

- `report.focused` / `report.id`
- `input.editable` / `input.multiline`
- `dialog.open`
- `combobox.open` / `combobox.id`
- `transaction.active`
- `form.id` / `form.disabled`
- module-specific keys such as `orders.search` or `inventory.itemDialog`

Bindings are resolved by normalized chord, context applicability, and priority. Context-specific bindings therefore override broad shell bindings without a second event listener; for example F6 opens a linked payment on an eligible Order/Delivery Memo detail but opens standalone Receive Payment elsewhere.

## Global write shortcuts

| Shortcut | Command | Route |
| --- | --- | --- |
| `F8` | New Sale | `/sales/new` |
| `Ctrl+F8` | New Order | `/orders/new` |
| `Alt+F8` | New Delivery Memo | `/delivery-memos/new` |
| `F6` | Receive Payment | `/payments/new` |
| `F9` | Stock Entry | `/inventory/stock-entry` |
| `Alt+F9` | Stock Transfer | `/inventory/stock-transfer` |

Shell/context shortcuts include `Alt+G` Go To, `F2` business period, and `F3` active shop. The feature registry gates write shortcuts by permission and implementation status; unsupported Physical Stock has no registered shortcut.

## Form and combobox behavior

`KeyboardFormScope` owns reusable form traversal as semantic commands:

- `Enter` advances to the next eligible `[data-kernel-field]` when a multiline field, dialog, or combobox does not own the key.
- `Shift+Enter` moves backward.
- `Ctrl+Enter` submits the form command.

`useKernelCombobox` owns Arrow/Home/End/Page navigation, Enter acceptance, and Escape close behavior for customer/item pickers. Portal/listbox components do not add competing global key listeners.

## Active pointer and restoration

Operational tables use `activePointerStore`. The active row/cell is not the same thing as the selection set. Drill-down navigation pushes a logical frame containing route, search, active pointer, selected IDs, filters, page, and scroll offset. Logical unwind restores that frame after navigation.

## Transaction state machines

Keyboard commands invoke backend domain transitions rather than mutating status locally:

- Orders: draft create -> confirm/reserve -> assign/pack/shortage -> serial-aware DM dispatch or safe sale conversion -> cancel/release reservations.
- Delivery Memo: draft -> explicit post (stock + receivable boundary) -> linked collection -> sale invoice conversion.
- Payments: record -> verify/mismatch; owner sale-payment amount correction uses optimistic concurrency and audit reason.
- Stock Entry: owner direct signed ledger write; staff submission becomes an approval request.
- Stock Transfer: direct atomic source OUT + target IN using available stock only; active reservations cannot be transferred.

Payment Attach is intentionally not exposed: the current backend attach service does not yet provide the ownership/allocation semantics required for an accounting-safe UI. Physical Stock remains unsupported until a real verification backend contract exists.

## Native editing rules

The keyboard service does not steal normal text editing, browser/system chords, IME composition, or non-repeatable command repeats. Backspace/Delete behavior is command-driven only where an explicit scoped command applies; otherwise native editing wins.

## Debugging

Development builds mount the Keyboard Inspector. It shows the last normalized key, winning command, candidate outcomes, and active context. It is intentionally toggled by pointer, not by another global debug shortcut.

## Migration rule

Do not add `window.addEventListener("keydown", ...)` outside `KeyboardService`. Do not add page-local shortcut engines or local keydown navigation to tables/comboboxes. Register a command, a keybinding, and the narrowest applicable context instead.
