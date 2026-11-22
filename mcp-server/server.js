#!/usr/bin/env node
// The server of the agents for LibreWolf.
//
// The server speaks the Model Context Protocol on the standard input and the
// standard output, so that any agent of the command line can start it. At the
// same time it listens on the loopback interface for the browser: the
// extension of the fork connects to it, receives the calls of the tools and
// gives the answers back.
//
// The server has no dependencies, it needs nothing but Node.js 18 or newer.

"use strict";

const http = require("node:http");
const readline = require("node:readline");

const HOST = process.env.LIBREWOLF_MCP_HOST || "127.0.0.1";
const PORT = Number(process.env.LIBREWOLF_MCP_PORT || 8977);

// The versions of the protocol the server understands.
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

// How long the agent waits for the answer of the browser.
const CALL_TIMEOUT_MS = Number(process.env.LIBREWOLF_MCP_TIMEOUT || 120000);

/** The tools of the browser, the extension knows how to do them. */
const TOOLS = [
  {
    name: "tabs_list",
    description: "Lists the tabs of the browser with their addresses and their titles.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tabs_create",
    description: "Opens a new tab with the given address.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "The address of the tab." } },
    },
  },
  {
    name: "tabs_close",
    description: "Closes the tab with the given number.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number", description: "The number of the tab." } },
      required: ["tabId"],
    },
  },
  {
    name: "tabs_activate",
    description: "Brings the tab with the given number to the front.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number", description: "The number of the tab." } },
      required: ["tabId"],
    },
  },
  {
    name: "navigate",
    description: "Opens the given address in the tab with the given number.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The number of the tab." },
        url: { type: "string", description: "The address to open." },
      },
      required: ["tabId", "url"],
    },
  },
  {
    name: "evaluate",
    description: "Runs the given code in the tab with the given number and gives the result back.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The number of the tab." },
        expression: { type: "string", description: "The code to run." },
      },
      required: ["tabId", "expression"],
    },
  },
  {
    name: "click",
    description: "Clicks the element of the tab with the given number that fits the selector.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The number of the tab." },
        selector: { type: "string", description: "The selector of the element." },
      },
      required: ["tabId", "selector"],
    },
  },
  {
    name: "screenshot",
    description: "Takes a picture of the visible part of the tab with the given number.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number", description: "The number of the tab." } },
    },
  },
  {
    name: "console_logs",
    description: "Gives the messages of the console of the tab with the given number.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number", description: "The number of the tab." } },
    },
  },
  {
    name: "network_requests",
    description: "Gives the last requests of the pages of the browser.",
    inputSchema: { type: "object", properties: {} },
  },
];

/** The streams of the events, every one of them is a client of the browser. */
const clients = new Set();

/** The calls that wait for the answer of the browser, by their number. */
const pending = new Map();
let callCounter = 0;

/** The tasks that the user writes in the panel of the browser. */
const taskQueue = [];

/** Writes a message of the protocol on the standard output. */
function sendMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/** The answer of the protocol to a request. */
function sendResult(id, result) {
  sendMessage({ jsonrpc: "2.0", id, result });
}

/** The answer of the protocol to a request that failed. */
function sendError(id, code, message) {
  sendMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

/** Sends an event to every client of the browser. */
function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

/**
 * Calls a tool of the browser and waits for its answer.
 *
 * @param {string} tool the name of the tool
 * @param {object} args the arguments of the tool
 * @returns {Promise<any>} the answer of the browser
 */
function callBrowser(tool, args) {
  if (!clients.size) {
    return Promise.reject(
      new Error(
        "The browser is not connected to the server, open LibreWolf with the extension of the console",
      ),
    );
  }

  const id = ++callCounter;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`The browser did not answer the call of ${tool} in time`));
    }, CALL_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    broadcast({ type: "tool-call", id, tool, args });
  });
}

/** The answer of the browser to a call of a tool. */
function onToolResult(message) {
  const call = pending.get(message.id);
  if (!call) {
    return;
  }

  pending.delete(message.id);
  clearTimeout(call.timer);

  if (message.error) {
    call.reject(new Error(String(message.error)));
    return;
  }

  call.resolve(message.result);
}

/** The parts of the request of the browser. */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const parts = [];
    request.on("data", (part) => parts.push(part));
    request.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    request.on("error", reject);
  });
}

/** The server of the browser. */
const server = http.createServer(async (request, response) => {
  const address = request.url || "/";

  if (request.method === "GET" && address === "/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.write(": the stream of the browser is open\n\n");
    clients.add(response);

    request.on("close", () => {
      clients.delete(response);
    });
    return;
  }

  if (request.method === "GET" && address === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, clients: clients.size }));
    return;
  }

  if (request.method === "POST" && address === "/command") {
    let body = "";
    try {
      body = await readBody(request);
      const message = JSON.parse(body || "{}");

      if (message.type === "tool-result") {
        onToolResult(message);
      } else if (message.type === "prompt") {
        taskQueue.push(message.text);
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: String(error) }));
    }
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "Unknown address" }));
});

/** Handles a message of the protocol of the agents. */
async function handleRequest(message) {
  const { id, method, params } = message;

  switch (method) {
    case "initialize": {
      const wanted = params && params.protocolVersion;
      const version = PROTOCOL_VERSIONS.includes(wanted) ? wanted : DEFAULT_PROTOCOL_VERSION;
      sendResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "librewolf-mcp", version: "1.0.0" },
      });
      return;
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return;

    case "ping":
      sendResult(id, {});
      return;

    case "tools/list":
      sendResult(id, { tools: TOOLS });
      return;

    case "tools/call": {
      const name = params && params.name;
      const args = (params && params.arguments) || {};

      try {
        const result = await callBrowser(name, args);
        sendResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (error) {
        sendResult(id, {
          content: [{ type: "text", text: `The browser could not do it: ${error.message}` }],
          isError: true,
        });
      }
      return;
    }

    case "prompts/list":
      sendResult(id, {
        prompts: [
          {
            name: "browser_task",
            description: "Gives the task that the user wrote in the console of the browser.",
            arguments: [],
          },
        ],
      });
      return;

    case "prompts/get": {
      const text = taskQueue.shift() || "";
      sendResult(id, {
        description: "The task of the user",
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      });
      return;
    }

    case "resources/list":
      sendResult(id, { resources: [] });
      return;

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Unknown method: ${method}`);
      }
  }
}

/** The line of the standard input is a message of the protocol. */
const lines = readline.createInterface({ input: process.stdin });

lines.on("line", async (line) => {
  const text = line.trim();
  if (!text) {
    return;
  }

  let message;
  try {
    message = JSON.parse(text);
  } catch (error) {
    sendError(null, -32700, "The message is not a valid json");
    return;
  }

  try {
    await handleRequest(message);
  } catch (error) {
    if (message.id !== undefined) {
      sendError(message.id, -32603, String(error.message || error));
    }
  }
});

lines.on("close", () => {
  for (const call of pending.values()) {
    clearTimeout(call.timer);
    call.reject(new Error("The server of the agents is closed"));
  }
  pending.clear();
  server.close();
  process.exit(0);
});

server.listen(PORT, HOST, () => {
  process.stderr.write(
    `The server of the agents of LibreWolf listens on http://${HOST}:${PORT}\n`,
  );
});
