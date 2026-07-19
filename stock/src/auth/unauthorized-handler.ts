type UnauthorizedHandler = (rejectedToken: string) => void | Promise<void>;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let tokenBeingHandled: string | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler;
}

export function reportUnauthorized(rejectedToken: string) {
  const handler = unauthorizedHandler;
  if (!handler || tokenBeingHandled === rejectedToken) return;

  tokenBeingHandled = rejectedToken;
  void Promise.resolve(handler(rejectedToken))
    .catch((error) => {
      console.warn("Failed to clear an unauthorized session", error);
    })
    .finally(() => {
      if (tokenBeingHandled === rejectedToken) tokenBeingHandled = null;
    });
}
