import type { DomainEvent } from "../../realtime/domainEvents";

export type ReadModelImpact = {
  customers: boolean;
  items: boolean;
  categories: boolean;
};

const NO_IMPACT: ReadModelImpact = { customers: false, items: false, categories: false };

export function getReadModelImpact(event: Pick<DomainEvent, "entity" | "action"> | null | undefined): ReadModelImpact {
  if (!event?.entity) return NO_IMPACT;

  if (event.entity === "customer") {
    return { customers: true, items: false, categories: false };
  }

  if (event.entity === "sale" || event.entity === "payment" || event.entity === "deliveryMemo" || event.entity === "order") {
    return { customers: true, items: false, categories: false };
  }

  if (event.entity === "item") {
    return { customers: false, items: true, categories: false };
  }

  if (event.entity === "category") {
    return { customers: false, items: true, categories: true };
  }

  return NO_IMPACT;
}

export function doesEventAffectReadModels(event: Pick<DomainEvent, "entity" | "action"> | null | undefined) {
  const impact = getReadModelImpact(event);
  return impact.customers || impact.items || impact.categories;
}
