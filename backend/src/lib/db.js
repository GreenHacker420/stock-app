import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = global.prisma || new PrismaClient({
  adapter,
  log: process.env.NODE_ENV !== "production" ? [{ emit: "event", level: "query" }] : undefined,
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
  prisma.$on?.("query", (event) => {
    if (event.duration >= 100) {
      console.log(`[prisma] ${event.duration}ms ${event.query}`);
    }
  });
}

export default prisma;
