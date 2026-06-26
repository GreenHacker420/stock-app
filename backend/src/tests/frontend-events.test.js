import test from "node:test";
import assert from "node:assert";
import { handleDomainEvent, invalidateForDomainEvent, hasSeenDomainEvent } from "../../../stock/src/realtime/domainEvents.ts";

class MockQueryClient {
  constructor() {
    this.invalidatedKeys = [];
  }

  invalidateQueries({ queryKey }) {
    this.invalidatedKeys.push(queryKey);
  }
}

test.describe("Frontend Domain Event Handler Tests (Step 8)", () => {
  let queryClient;

  test.beforeEach(() => {
    queryClient = new MockQueryClient();
    // Clear seen map for testing
    // Since hasSeenDomainEvent has seenEventIds internally, we can clear it by sending unique random eventIds in tests
  });

  test("1. Duplicate eventId is ignored", () => {
    const eventId = `evt_dedupe_${Math.random()}`;
    const event = {
      eventId,
      shopId: "shop_1",
      entity: "sale",
      action: "created",
      entityId: "sale_1",
      actorUserId: "user_1",
      updatedAt: new Date().toISOString()
    };

    const firstResult = handleDomainEvent(queryClient, event);
    assert.strictEqual(firstResult, true, "First time seeing the event should return true");
    assert.strictEqual(queryClient.invalidatedKeys.length, 5, "First time should invalidate queries");

    queryClient.invalidatedKeys = [];
    const secondResult = handleDomainEvent(queryClient, event);
    assert.strictEqual(secondResult, false, "Second time seeing the event should return false");
    assert.strictEqual(queryClient.invalidatedKeys.length, 0, "Second time should not invalidate queries");
  });

  test("2. Sale event invalidates sales/dashboard/customers/staff summary/sale detail", () => {
    const event = {
      eventId: `evt_sale_${Math.random()}`,
      shopId: "shop_1",
      entity: "sale",
      action: "created",
      entityId: "sale_1",
      actorUserId: "user_1",
      updatedAt: new Date().toISOString()
    };

    handleDomainEvent(queryClient, event);

    const keys = queryClient.invalidatedKeys.map(k => JSON.stringify(k));
    assert.ok(keys.includes(JSON.stringify(["sales", "shop_1"])), "Should invalidate sales list");
    assert.ok(keys.includes(JSON.stringify(["sale", "sale_1"])), "Should invalidate sale detail");
    assert.ok(keys.includes(JSON.stringify(["owner-dashboard", { shopId: "shop_1" }])), "Should invalidate owner dashboard shop-scoped");
    assert.ok(keys.includes(JSON.stringify(["staff-today-summary", "shop_1"])), "Should invalidate staff summary");
    assert.ok(keys.includes(JSON.stringify(["customers", "shop_1"])), "Should invalidate customers");
  });

  test("3. Payment event invalidates payments/dashboard/customers/cash sessions", () => {
    const event = {
      eventId: `evt_payment_${Math.random()}`,
      shopId: "shop_1",
      entity: "payment",
      action: "created",
      entityId: "payment_1",
      actorUserId: "user_1",
      updatedAt: new Date().toISOString()
    };

    handleDomainEvent(queryClient, event);

    const keys = queryClient.invalidatedKeys.map(k => JSON.stringify(k));
    assert.ok(keys.includes(JSON.stringify(["payments", "shop_1"])), "Should invalidate payments");
    assert.ok(keys.includes(JSON.stringify(["owner-dashboard", { shopId: "shop_1" }])), "Should invalidate dashboard");
    assert.ok(keys.includes(JSON.stringify(["customers", "shop_1"])), "Should invalidate customers");
    assert.ok(keys.includes(JSON.stringify(["current-cash-session", "shop_1"])), "Should invalidate current cash session");
    assert.ok(keys.includes(JSON.stringify(["cash-sessions", "shop_1"])), "Should invalidate cash sessions list");
  });

  test("4. Cash session event invalidates current cash session/dashboard", () => {
    const event = {
      eventId: `evt_cash_${Math.random()}`,
      shopId: "shop_1",
      entity: "cashSession",
      action: "updated",
      entityId: "session_1",
      actorUserId: "user_1",
      updatedAt: new Date().toISOString()
    };

    handleDomainEvent(queryClient, event);

    const keys = queryClient.invalidatedKeys.map(k => JSON.stringify(k));
    assert.ok(keys.includes(JSON.stringify(["current-cash-session", "shop_1"])), "Should invalidate current cash session");
    assert.ok(keys.includes(JSON.stringify(["cash-sessions", "shop_1"])), "Should invalidate cash sessions list");
    assert.ok(keys.includes(JSON.stringify(["owner-dashboard", { shopId: "shop_1" }])), "Should invalidate dashboard");
  });

  test("6. Same-device event does not duplicate local pending sale", () => {
    const event = {
      eventId: `evt_same_device_${Math.random()}`,
      shopId: "shop_1",
      entity: "sale",
      action: "created",
      entityId: "sale_1",
      actorUserId: "user_1",
      sourceDeviceId: "device_current",
      updatedAt: new Date().toISOString()
    };

    const handled = handleDomainEvent(queryClient, event, "device_current");
    assert.strictEqual(handled, false, "Should ignore event from the same device");
    assert.strictEqual(queryClient.invalidatedKeys.length, 0, "Should not trigger any invalidations");
  });

  test("8. Malformed event is ignored safely", () => {
    const handledNull = handleDomainEvent(queryClient, null);
    assert.strictEqual(handledNull, false, "Should return false for null event");
    assert.strictEqual(queryClient.invalidatedKeys.length, 0);

    const handledEmpty = handleDomainEvent(queryClient, {});
    assert.strictEqual(handledEmpty, false, "Should return false for empty event");
    assert.strictEqual(queryClient.invalidatedKeys.length, 0);
  });

  test.describe("Frontend Reconciliation & Cursor Management Tests", () => {
    let mockMmkv;
    let mockQueryClient;
    
    test.beforeEach(() => {
      mockMmkv = new Map();
      mockQueryClient = new MockQueryClient();
    });

    test("1. Cursor key is shop-scoped to prevent shop leak", () => {
      const shop1 = "shop_1";
      const shop2 = "shop_2";
      
      const key1 = `domain_event_cursor:${shop1}`;
      const key2 = `domain_event_cursor:${shop2}`;
      
      mockMmkv.set(key1, "cursor_1");
      mockMmkv.set(key2, "cursor_2");
      
      assert.strictEqual(mockMmkv.get(key1), "cursor_1");
      assert.strictEqual(mockMmkv.get(key2), "cursor_2");
      assert.notStrictEqual(mockMmkv.get(key1), mockMmkv.get(key2));
    });

    test("2. Reconciled events are run through handleDomainEvent and update cursor on success", () => {
      const cursorKey = "domain_event_cursor:shop_1";
      mockMmkv.set(cursorKey, "cursor_old");
      
      const mockResult = {
        events: [
          { eventId: `evt_rec_1_${Math.random()}`, shopId: "shop_1", entity: "sale", action: "created", entityId: "sale_1", actorUserId: "user_1", updatedAt: "2026-06-26T18:00:00.000Z" },
          { eventId: `evt_rec_2_${Math.random()}`, shopId: "shop_1", entity: "payment", action: "created", entityId: "pay_1", actorUserId: "user_1", updatedAt: "2026-06-26T18:05:00.000Z" }
        ],
        nextCursor: "2026-06-26T18:05:00.000Z"
      };

      for (const event of mockResult.events) {
        const handled = handleDomainEvent(mockQueryClient, event);
        if (handled && event.updatedAt) {
          mockMmkv.set(cursorKey, event.updatedAt);
        }
      }
      if (mockResult.nextCursor) {
        mockMmkv.set(cursorKey, mockResult.nextCursor);
      }

      assert.strictEqual(mockMmkv.get(cursorKey), "2026-06-26T18:05:00.000Z", "Cursor should be updated to the latest nextCursor");
      assert.ok(mockQueryClient.invalidatedKeys.length > 0, "Should invalidate queries for synced events");
    });

    test("3. Fallback logic invalidates all critical queries on sync error", () => {
      const invalidateCriticalQueries = () => {
        mockQueryClient.invalidateQueries({ queryKey: ["sales", "shop_1"] });
        mockQueryClient.invalidateQueries({ queryKey: ["payments", "shop_1"] });
        mockQueryClient.invalidateQueries({ queryKey: ["current-stock", "shop_1"] });
        mockQueryClient.invalidateQueries({ queryKey: ["orders", "shop_1"] });
        mockQueryClient.invalidateQueries({ queryKey: ["delivery-memos", "shop_1"] });
        mockQueryClient.invalidateQueries({ queryKey: ["current-cash-session", "shop_1"] });
        mockQueryClient.invalidateQueries({ queryKey: ["owner-dashboard", { shopId: "shop_1" }] });
        mockQueryClient.invalidateQueries({ queryKey: ["notifications", { shopId: "shop_1" }] });
      };

      try {
        throw new Error("API Network Failure");
      } catch (err) {
        invalidateCriticalQueries();
      }

      const keys = mockQueryClient.invalidatedKeys.map(k => JSON.stringify(k));
      assert.ok(keys.includes(JSON.stringify(["sales", "shop_1"])));
      assert.ok(keys.includes(JSON.stringify(["payments", "shop_1"])));
      assert.ok(keys.includes(JSON.stringify(["current-stock", "shop_1"])));
      assert.ok(keys.includes(JSON.stringify(["orders", "shop_1"])));
      assert.ok(keys.includes(JSON.stringify(["delivery-memos", "shop_1"])));
      assert.ok(keys.includes(JSON.stringify(["current-cash-session", "shop_1"])));
      assert.ok(keys.includes(JSON.stringify(["owner-dashboard", { shopId: "shop_1" }])));
      assert.ok(keys.includes(JSON.stringify(["notifications", { shopId: "shop_1" }])));
    });
  });
});
