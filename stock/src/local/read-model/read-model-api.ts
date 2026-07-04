import { apiRequest } from "../../api/client";
import type { MobileReadModelBootstrap } from "./read-model-types";

export function fetchReadModelBootstrap(token: string, shopId: string) {
  return apiRequest<MobileReadModelBootstrap>(
    `/sync/read-models/bootstrap?shopId=${encodeURIComponent(shopId)}`,
    { token },
  );
}
