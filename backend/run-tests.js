import { run } from "node:test";
import { spec } from "node:test/reporters";
import path from "node:path";
import prisma from "./src/lib/db.js";

let hasFailures = false;

// We support passing a specific test file as an argument
const testFileArg = process.argv[2];
const files = testFileArg
  ? [path.resolve(testFileArg)]
  : [
      path.resolve("src/tests/api-contract.test.js"),
      path.resolve("src/tests/delivery-memo-domain.test.js"),
      path.resolve("src/tests/phase1-security.test.js"),
      path.resolve("src/tests/phase2-core.test.js"),
      path.resolve("src/tests/sale-amendments.test.js"),
      path.resolve("src/tests/realtime.test.js"),
      path.resolve("src/tests/frontend-events.test.js"),
      path.resolve("src/tests/harden-mobile.test.js"),
      path.resolve("src/tests/harden-server-cache.test.js")
    ];

console.log(`Running tests: ${files.map(f => path.basename(f)).join(", ")}...`);

const stream = run({
  files,
  concurrency: 1,
  forceExit: true,
});

stream.on("test:fail", (data) => {
  hasFailures = true;
  console.error(`\n❌ Test Failed: ${data.name}\nError: ${data.details?.error?.message || "Unknown error"}\nStack: ${data.details?.error?.stack || "No stack trace"}\n`);
});

stream.compose(new spec()).pipe(process.stdout);

stream.on("end", async () => {
  console.log("\nTests completed. Cleaning up database connections...");
  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error("Error disconnecting Prisma:", err.message);
  }
  
  // Force exit to prevent hanging due to active Redis/BullMQ connection pools
  setTimeout(() => {
    process.exit(hasFailures ? 1 : 0);
  }, 500);
});
