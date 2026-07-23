const SUCCESS_RANK = {
  PENDING: 0,
  ACCEPTED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
};

export function projectProviderStatus(providerStatus, contentState = "VISIBLE") {
  if (contentState === "DELETED") return "DELETED";
  if (providerStatus === "FAILED") return "FAILED";
  if (providerStatus === "READ") return "READ";
  if (providerStatus === "DELIVERED") return "DELIVERED";
  if (providerStatus === "SENT" || providerStatus === "ACCEPTED") return "SENT";
  return "QUEUED";
}

export function resolveProviderTransition(current, incoming) {
  if (incoming.attempt !== current.attempt) {
    return incoming.attempt < current.attempt
      ? { apply: false, reason: "older_attempt" }
      : { apply: false, reason: "unknown_future_attempt" };
  }

  const currentTime = current.providerStatusAt
    ? new Date(current.providerStatusAt).getTime()
    : 0;
  const incomingTime = new Date(incoming.providerTimestamp).getTime();
  if (!Number.isFinite(incomingTime)) {
    return { apply: false, reason: "invalid_timestamp" };
  }
  if (incomingTime < currentTime) {
    return { apply: false, reason: "older_timestamp" };
  }

  if (current.providerStatus === "READ" && incoming.providerStatus !== "READ") {
    return { apply: false, reason: "read_is_terminal" };
  }

  const currentRank = SUCCESS_RANK[current.providerStatus];
  const incomingRank = SUCCESS_RANK[incoming.providerStatus];
  if (currentRank !== undefined && incomingRank !== undefined && incomingRank < currentRank) {
    return { apply: false, reason: "success_regression" };
  }

  if (
    current.providerStatus === incoming.providerStatus
    && incomingTime <= currentTime
  ) {
    return { apply: false, reason: "duplicate" };
  }

  return {
    apply: true,
    providerStatus: incoming.providerStatus,
    providerStatusAt: new Date(incomingTime),
    projectedStatus: projectProviderStatus(incoming.providerStatus, current.contentState),
  };
}
