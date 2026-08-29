import { activePointerStore, type ActivePointer } from "./active-pointer-store";
export function activatePointer(pointer: ActivePointer): void { activePointerStore.setPointer(pointer); }
