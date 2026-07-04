import { apiRequest } from "../../api/client";
import type { MobileReadModelBootstrap, MobileReadModelDomainRepair, ReadModelDomain } from "./read-model-types";

export function fetchReadModelBootstrap(token: string, shopId: string) {
  return apiRequest<MobileReadModelBootstrap>(
    `/sync/read-models/bootstrap?shopId=${encodeURIComponent(shopId)}`,
    { token },
  );
}

export function fetchReadModelDomain<T extends ReadModelDomain>(token: string, shopId: string, domain: T) {
  return apiRequest<MobileReadModelDomainRepair<T>>(
    `/sync/read-models/${domain}?shopId=${encodeURIComponent(shopId)}`,
    { token },
  );
}
