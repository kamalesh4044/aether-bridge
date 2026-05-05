import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import os from "os";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Aether-Bridge: The Premium MCP Server
 * Developed by Kamal
 */

const server = new Server(
  {
    name: "aether-bridge",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register the tools so the AI can see them
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_system_info",
        description: "Get real-time CPU, RAM, and OS information from the host computer.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_directory",
        description: "List all files and folders in a specific directory.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path" },
          },
          required: ["path"],
        },
      },
      {
        name: "read_file",
        description: "Read the contents of a specific file.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path" },
          },
          required: ["path"],
        },
      },
      {
        name: "run_command",
        description: "Run a shell command (PowerShell/Bash) and get the output.",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The command to execute" },
          },
          required: ["command"],
        },
      },
      {
        name: "analyze_binary",
        description: "Perform deep analysis on a binary file to find strings and syscall patterns.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the binary file" },
            minStringLength: { type: "number", description: "Minimum length of strings to find" },
          },
          required: ["path"],
        },
      },
    ],
  };
});

// Handle the actual tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_system_info") {
      const stats = {
        platform: os.platform(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        totalMemory: `${(os.totalmem() / 1e9).toFixed(2)} GB`,
        freeMemory: `${(os.freemem() / 1e9).toFixed(2)} GB`,
        uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
        loadAvg: os.loadavg(),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      };
    }

    if (name === "list_directory") {
      const { path } = z.object({ path: z.string() }).parse(args);
      const files = await fs.readdir(path);
      return {
        content: [{ type: "text", text: files.join("\n") }],
      };
    }

    if (name === "read_file") {
      const { path } = z.object({ path: z.string() }).parse(args);
      const content = await fs.readFile(path, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    }

    if (name === "run_command") {
      const { command } = z.object({ command: z.string() }).parse(args);
      const { stdout, stderr } = await execAsync(command);
      return {
        content: [
          { type: "text", text: `Output:\n${stdout}${stderr ? `\nErrors:\n${stderr}` : ""}` },
        ],
      };
    }

    if (name === "analyze_binary") {
      const { path, minStringLength = 4 } = z.object({ 
        path: z.string(), 
        minStringLength: z.number().optional() 
      }).parse(args);
      
      const buffer = await fs.readFile(path);
      let strings = [];
      let currentString = "";
      
      for (let i = 0; i < buffer.length; i++) {
        const charCode = buffer[i];
        if (charCode >= 32 && charCode <= 126) {
          currentString += String.fromCharCode(charCode);
        } else {
          if (currentString.length >= minStringLength) {
            strings.push(currentString);
          }
          currentString = "";
        }
      }

      return {
        content: [
          { 
            type: "text", 
            text: `Analysis Complete.\nFound ${strings.length} strings.\n\nFirst 50 strings:\n${strings.slice(0, 50).join('\n')}` 
          }
        ],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server using standard I/O (Stdio)
// This is how modern AI models like Claude connect to local tools.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Aether-Bridge MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in Aether-Bridge:", error);
  process.exit(1);
});
