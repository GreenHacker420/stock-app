import prisma from "../lib/db.js";

function screenById(flowJson, screenId) {
  return flowJson?.screens?.find((screen) => screen.id === screenId);
}

function entryScreen(flowJson) {
  const routing = flowJson?.routing_model || {};
  const targets = new Set(Object.values(routing).flat());
  return flowJson?.screens?.find((screen) => !targets.has(screen.id)) || flowJson?.screens?.[0];
}

function nextScreen(flowJson, currentScreen) {
  const nextId = flowJson?.routing_model?.[currentScreen]?.[0];
  return screenById(flowJson, nextId);
}

function completeResponse(flowToken, data = {}) {
  return {
    screen: "SUCCESS",
    data: {
      extension_message_response: {
        params: {
          flow_token: flowToken,
          ...data,
        },
      },
    },
  };
}

class WhatsAppFlowRuntimeService {
  async resolveEndpoint(endpointRef) {
    const byKey = await prisma.waFlow.findUnique({
      where: { endpointKey: endpointRef },
      include: {
        shop: { select: { id: true } },
      },
    });
    if (byKey && byKey.endpointEnabled && !byKey.deletedAt) {
      return { flow: byKey, shopId: byKey.shopId };
    }
    const integration = await prisma.waIntegration.findUnique({
      where: { shopId: endpointRef },
      select: { shopId: true },
    });
    return integration ? { flow: null, shopId: integration.shopId } : null;
  }

  async handle(flow, execution, request) {
    if (request.action === "ping") return { data: { status: "active" } };
    if (request.data?.error || request.data?.error_message) {
      return { data: { acknowledged: true } };
    }
    if (!flow || !execution) throw new Error("Flow execution could not be resolved");
    const flowJson = flow.flowJson || {};
    const current = screenById(flowJson, request.screen) || entryScreen(flowJson);
    if (!current) throw new Error("Flow has no routable screen");

    if (request.action === "INIT") {
      return {
        screen: current.id,
        data: execution.inputJson || {},
      };
    }

    if (current.terminal === true || request.data?.complete === true) {
      return completeResponse(request.flow_token, request.data || {});
    }

    const next = nextScreen(flowJson, current.id);
    if (!next) return completeResponse(request.flow_token, request.data || {});
    return {
      screen: next.id,
      data: request.data || {},
    };
  }
}

export const whatsappFlowRuntimeService = new WhatsAppFlowRuntimeService();
