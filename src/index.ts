#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { startHttpServer } from "./transport/http.js";
import { closePool } from "./db/index.js";

const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http";
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function main(): Promise<void> {
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
