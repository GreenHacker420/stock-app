import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribeMobile(listener: () => void) {
  const query = window.matchMedia(MOBILE_QUERY)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

export function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false)
}
