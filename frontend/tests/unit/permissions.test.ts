import { describe, it, expect } from "vitest";
import { hasPermission, PERMISSIONS, UserPermissionsSubject } from "../../lib/permissions/permissions";

describe("hasPermission (Fail-Closed)", () => {
  it("returns false for null user", () => {
    expect(hasPermission(null, PERMISSIONS.SALE_CREATE)).toBe(false);
  });

  it("returns false for undefined user", () => {
    expect(hasPermission(undefined, PERMISSIONS.SALE_CREATE)).toBe(false);
  });

  it("returns true for OWNER role regardless of permission array", () => {
    const owner: UserPermissionsSubject = { role: "OWNER", permissions: [] };
    expect(hasPermission(owner, PERMISSIONS.SALE_CREATE)).toBe(true);
    expect(hasPermission(owner, "customer:delete")).toBe(false);
  });

  it("returns true for STAFF with explicit permission", () => {
    const staff: UserPermissionsSubject = {
      role: "STAFF",
      permissions: [PERMISSIONS.SALE_CREATE, PERMISSIONS.ITEM_VIEW],
    };
    expect(hasPermission(staff, PERMISSIONS.SALE_CREATE)).toBe(true);
    expect(hasPermission(staff, PERMISSIONS.ITEM_VIEW)).toBe(true);
  });

  it("returns false for STAFF without explicit permission", () => {
    const staff: UserPermissionsSubject = {
      role: "STAFF",
      permissions: [PERMISSIONS.ITEM_VIEW],
    };
    expect(hasPermission(staff, PERMISSIONS.SALE_CREATE)).toBe(false);
  });

  it("returns false for STAFF with missing or null permissions array", () => {
    const staffNoArr: UserPermissionsSubject = {
      role: "STAFF",
    };
    expect(hasPermission(staffNoArr, PERMISSIONS.SALE_CREATE)).toBe(false);
  });

  it("returns false for unknown / invalid permission strings", () => {
    const owner: UserPermissionsSubject = { role: "OWNER" };
    const staff: UserPermissionsSubject = { role: "STAFF", permissions: ["random:permission"] };

    expect(hasPermission(owner, "invalid:permission:name")).toBe(false);
    expect(hasPermission(staff, "random:permission")).toBe(false);
  });
});
