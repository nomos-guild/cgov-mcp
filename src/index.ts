#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { startHttpServer } from "./transport/http.js";
import { checkDbHealth, closePool } from "./db/index.js";

const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http";
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function runStartupDbCheck(): Promise<void> {
  const health = await checkDbHealth();
  if (health.ok) {
    console.error(`cgov-mcp DB check: ${health.message}`);
    return;
  }
  console.error(`cgov-mcp DB check FAILED: ${health.message}`);
  if (process.env.STRICT_DB_CHECK === "true") {
    throw new Error(`Refusing to start: ${health.message}`);
  }
  console.error(
    "cgov-mcp continuing to start; DB-backed tools will fail until this is resolved. " +
      "Set STRICT_DB_CHECK=true to crash on bad config instead."
  );
}

async function main(): Promise<void> {
  await runStartupDbCheck();

  if (TRANSPORT_MODE === "stdio") {
    // Stdio mode for direct Claude Desktop integration
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("cgov-mcp server running on stdio");
  } else {
    // HTTP mode (default) - runs as web server
    await startHttpServer(createServer, { port: PORT, host: HOST });
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
