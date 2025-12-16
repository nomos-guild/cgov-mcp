import express, { type Request, type Response } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface HttpServerOptions {
  port: number;
  host?: string;
}

export async function startHttpServer(
  createServerFn: () => Server,
  options: HttpServerOptions
): Promise<void> {
  const { port, host = "0.0.0.0" } = options;

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", server: "cgov-mcp" });
  });

  // Streamable HTTP endpoint for MCP connections
  app.post("/mcp", async (req: Request, res: Response) => {
    console.error(`[${new Date().toISOString()}] MCP request received`);

    const server = createServerFn();

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        console.error(`[${new Date().toISOString()}] MCP request closed`);
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  // Handle unsupported methods on /mcp
  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST.",
      },
      id: null,
    });
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  app.listen(port, host, () => {
    console.error(`cgov-mcp HTTP server running at http://${host}:${port}`);
    console.error(`  - MCP endpoint: http://${host}:${port}/mcp`);
    console.error(`  - Health check: http://${host}:${port}/health`);
  });
}
