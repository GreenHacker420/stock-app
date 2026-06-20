export function parseFlowJson(input) {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Flow JSON is invalid: ${error.message}`);
  }
}

export function validateFlowJson(input) {
  const errors = [];
  let flowJson;
  try {
    flowJson = parseFlowJson(input);
  } catch (error) {
    return { valid: false, errors: [{ path: "$", message: error.message }] };
  }
  const size = Buffer.byteLength(JSON.stringify(flowJson));
  if (size > 10 * 1024 * 1024) errors.push({ path: "$", message: "Flow JSON must be 10 MB or smaller" });
  if (!flowJson || typeof flowJson !== "object" || Array.isArray(flowJson)) {
    errors.push({ path: "$", message: "Flow JSON must be an object" });
    return { valid: false, errors };
  }
  if (!flowJson.version || typeof flowJson.version !== "string") {
    errors.push({ path: "version", message: "Flow JSON version is required" });
  }
  if (!Array.isArray(flowJson.screens) || flowJson.screens.length === 0) {
    errors.push({ path: "screens", message: "At least one screen is required" });
    return { valid: false, errors, flowJson };
  }
  const ids = new Set();
  let terminalCount = 0;
  flowJson.screens.forEach((screen, index) => {
    const path = `screens[${index}]`;
    if (!screen?.id || typeof screen.id !== "string") errors.push({ path: `${path}.id`, message: "Screen ID is required" });
    else if (ids.has(screen.id)) errors.push({ path: `${path}.id`, message: "Screen IDs must be unique" });
    else ids.add(screen.id);
    if (!screen?.title || typeof screen.title !== "string") errors.push({ path: `${path}.title`, message: "Screen title is required" });
    if (screen?.terminal === true) terminalCount += 1;
    if (screen?.layout?.type !== "SingleColumnLayout" || !Array.isArray(screen?.layout?.children)) {
      errors.push({ path: `${path}.layout`, message: "Screens require a SingleColumnLayout with children" });
    }
  });
  if (terminalCount === 0) errors.push({ path: "screens", message: "At least one terminal screen is required" });
  if (flowJson.routing_model) {
    Object.entries(flowJson.routing_model).forEach(([screenId, targets]) => {
      if (!ids.has(screenId)) errors.push({ path: `routing_model.${screenId}`, message: "Routing source screen does not exist" });
      if (!Array.isArray(targets)) errors.push({ path: `routing_model.${screenId}`, message: "Routing targets must be an array" });
      else targets.forEach((target) => {
        if (!ids.has(target)) errors.push({ path: `routing_model.${screenId}`, message: `Routing target ${target} does not exist` });
      });
    });
  }
  return { valid: errors.length === 0, errors, flowJson };
}
