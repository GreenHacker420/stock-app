import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { configureRealtime } from "./utils/realtime.js";
import { startAllWorkers } from "./workers/index.js";
import { getCorsOrigin, isWhatsAppEnabled } from "./utils/env.js";

import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";

const app = createApp();

const httpServer = createServer(app);

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const pubClient = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const subClient = pubClient.duplicate();

const io = new Server(httpServer, {
  cors: {
    origin: getCorsOrigin(),
    methods: ["GET", "POST"],
  },
});

io.adapter(createAdapter(pubClient, subClient));

configureRealtime(io);

app.set("io", io);

const PORT = process.env.PORT || 6600;

httpServer.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  if (isWhatsAppEnabled()) {
    const { warmTenantCache } = await import("./lib/wa-cache.js");
    await import("./services/whatsapp.queue.js");
    await warmTenantCache();
  }
  
  // Start background queue workers
  try {
    await startAllWorkers({ whatsappEnabled: isWhatsAppEnabled() });
  } catch (err) {
    console.error("Failed to start background workers:", err.message);
  }
});
