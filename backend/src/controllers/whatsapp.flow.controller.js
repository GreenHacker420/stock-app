import { whatsappFlowService } from "../services/whatsapp.flow.service.js";

function errorMessage(error) {
  return error.response?.data?.error?.message
    || error.issues?.[0]?.message
    || error.message;
}

class WhatsAppFlowController {
  async list(req, res) {
    try {
      const result = await whatsappFlowService.listFlows(req.shop.id, req.query);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async get(req, res) {
    try {
      const flow = await whatsappFlowService.getFlow(req.shop.id, req.params.id);
      res.json({ success: true, data: flow });
    } catch (error) {
      res.status(404).json({ success: false, message: errorMessage(error) });
    }
  }

  async create(req, res) {
    try {
      const result = await whatsappFlowService.createFlow(req.shop.id, req.body);
      if (result.validationErrors) {
        return res.status(422).json({ success: false, message: "Flow JSON validation failed", data: result });
      }
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async updateDraft(req, res) {
    try {
      const flow = await whatsappFlowService.updateDraft(req.shop.id, req.params.id, req.body);
      res.json({ success: true, data: flow });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async validate(req, res) {
    try {
      const result = await whatsappFlowService.validateFlow(req.shop.id, req.params.id);
      res.status(result.valid ? 200 : 422).json({ success: result.valid, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async deploy(req, res) {
    try {
      const result = await whatsappFlowService.deployFlow(req.shop.id, req.params.id);
      if (result.valid === false) {
        return res.status(422).json({ success: false, message: "Flow JSON validation failed", data: result });
      }
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async preview(req, res) {
    try {
      const preview = await whatsappFlowService.getPreview(
        req.shop.id,
        req.params.id,
        req.body.invalidate === true,
      );
      res.json({ success: true, data: preview });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async publish(req, res) {
    try {
      const flow = await whatsappFlowService.publishFlow(req.shop.id, req.params.id);
      res.json({ success: true, data: flow });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async deprecate(req, res) {
    try {
      const flow = await whatsappFlowService.deprecateFlow(req.shop.id, req.params.id);
      res.json({ success: true, data: flow });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async remove(req, res) {
    try {
      const flow = await whatsappFlowService.deleteFlow(req.shop.id, req.params.id);
      res.json({ success: true, data: flow });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async sync(req, res) {
    try {
      const result = await whatsappFlowService.syncFlows(req.shop.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async executions(req, res) {
    try {
      const data = await whatsappFlowService.listExecutions(req.shop.id, req.params.id, req.query.limit);
      res.json({ success: true, data });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async send(req, res) {
    try {
      const data = await whatsappFlowService.sendFlow(req.shop.id, req.params.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }

  async registerPublicKey(req, res) {
    try {
      const data = await whatsappFlowService.registerPublicKey(req.shop.id);
      res.json({ success: true, data });
    } catch (error) {
      res.status(400).json({ success: false, message: errorMessage(error) });
    }
  }
}

export const whatsappFlowController = new WhatsAppFlowController();
