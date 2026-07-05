import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to db-explorer-mcp/.env");
}

// 1. Initialize Database Connection (Reuse your LeetCode DB)
const queryClient = postgres(process.env.DATABASE_URL);
const db = drizzle(queryClient);

// 2. Create the MCP Server instance
const server = new Server(
  { name: "db-explorer", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 3. Define "What can you do?" (List Tools)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_submission_trends",
        description: "Get the count of submissions grouped by status (PENDING, SUCCESS, etc.)",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_recent_errors",
        description: "Get the last 5 failed submissions with their compile errors",
        inputSchema: { type: "object", properties: {} },
      }
    ],
  };
});

// 4. Define "How to do it" (Call Tool)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  try {
    if (name === "get_submission_trends") {
      const results = await queryClient`SELECT status, count(*) FROM submissions GROUP BY status`;
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    if (name === "get_recent_errors") {
      const errors = await queryClient`SELECT id, "compileError" FROM submissions WHERE status = 'ERROR' LIMIT 5`;
      return {
        content: [{ type: "text", text: JSON.stringify(errors, null, 2) }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// 5. Start the server using Standard Input/Output (Stdio)
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("DB Explorer MCP Server running on stdio");