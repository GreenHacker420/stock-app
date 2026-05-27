import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { configureRealtime } from "./utils/realtime.js";

const app = createApp();

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

configureRealtime(io);

app.set("io", io);

const PORT = process.env.PORT || 6600;

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
