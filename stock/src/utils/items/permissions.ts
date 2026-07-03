import { ApiUser } from "../../api/client";


export const STOCK_MOVEMENT_PERMISSION = "stock:create_movement";

export function hasPermission(user: ApiUser | null | undefined, permission: string): boolean {
  return !!user?.permissions?.includes(permission);
}
