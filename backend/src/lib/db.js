import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
