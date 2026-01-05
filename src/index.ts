/**
 * M8 Display Server - Entry Point
 * High-performance M8 Tracker control server
 */

import { parseArgs } from "util";
import { M8Connection, findM8Device, listPorts } from "./serial/connection";
import { TextBuffer } from "./display/buffer";
import { Framebuffer } from "./display/framebuffer";
import { M8Server } from "./server/http";
import { TcpProxy } from "./server/tcp-proxy";
import type { ParsedCommand } from "./state/types";

// Parse CLI arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: "string", short: "p", default: "" },
    http: { type: "string", short: "h", default: "8080" },
    "tcp-proxy": { type: "string", short: "t", default: "3333" },
    list: { type: "boolean", short: "l", default: false },
    help: { type: "boolean", default: false },
  },
});

// Help
if (values.help) {
  console.log(`
M8 Display Server

Usage:
  npx tsx src/index.ts [options]

Options:
  -p, --port <path>      Serial port (auto-detect if not specified)
  -h, --http <port>      HTTP server port (default: 8080)
  -t, --tcp-proxy <port> TCP proxy port for remote m8c (default: 3333, 0 to disable)
  -l, --list             List available serial ports
  --help                 Show this help

Examples:
  npx tsx src/index.ts                           # HTTP:8080 + TCP:3333
  npx tsx src/index.ts -p /dev/ttyACM0           # Specific port
  npx tsx src/index.ts -t 0                      # Disable TCP proxy
`);
  process.exit(0);
}

// List ports
if (values.list) {
  console.log("Available serial ports:");
  const ports = await listPorts();
  for (const port of ports) {
    const isM8 = port.vendorId === "16c0" &&
                 (port.productId === "048a" || port.productId === "048b");
    console.log(`  ${port.path}${isM8 ? " [M8]" : ""}`);
    if (port.manufacturer) console.log(`    Manufacturer: ${port.manufacturer}`);
    if (port.vendorId) console.log(`    VID:PID: ${port.vendorId}:${port.productId}`);
  }
  process.exit(0);
}

// Find or use specified port
let serialPort = values.port || "";
if (!serialPort) {
  console.log("Searching for M8 device...");
  serialPort = await findM8Device() || "";
  if (serialPort) {
    console.log(`Found M8 at ${serialPort}`);
  } else {
    console.log("M8 not found, will auto-detect when connected...");
  }
}

// Create components
const buffer = new TextBuffer();
const framebuffer = new Framebuffer();

// TCP Proxy (optional)
let tcpProxy: TcpProxy | null = null;
const tcpProxyPort = values["tcp-proxy"] ? parseInt(values["tcp-proxy"]) : 0;

const connection = new M8Connection({
  port: serialPort,
  autoReconnect: true,
  reconnectInterval: 1000,
  onCommand: (cmd: ParsedCommand) => {
    // Debug: log command types (1% sample)
    if (Math.random() < 0.01) {
      console.log(`[Cmd] type=${cmd.type}`);
    }

    // Update text buffer
    if (cmd.type === "text") {
      buffer.applyText(cmd);
      framebuffer.applyText(cmd);
    } else if (cmd.type === "rect") {
      buffer.applyRect(cmd);
      framebuffer.applyRect(cmd);
    } else if (cmd.type === "wave") {
      framebuffer.applyWave(cmd);
    }

    // Broadcast to WebSocket clients
    server.broadcastCommand(cmd);
  },
  onSerialData: (data: Uint8Array) => {
    // Forward raw serial bytes to WebSocket display clients (new)
    server.broadcastDisplay(data);

    // Forward to TCP proxy clients (legacy, for backward compatibility)
    if (tcpProxy) {
      // Debug: log when we're sending display data
      if (tcpProxy.getClientCount() > 0 && data.length > 0) {
        // Only log occasionally to avoid spam
        if (Math.random() < 0.01) {
          console.log(`[Debug] onSerialData: ${data.length} bytes, ${tcpProxy.getClientCount()} clients`);
        }
      }
      tcpProxy.broadcast(data);
    }
  },
  onConnect: async () => {
    console.log("M8 connected");
    // Re-enable display after reconnect
    connection.enable().catch(() => {});

    // Restart audio streaming if there are audio clients
    // Wait for USB audio device to enumerate
    setTimeout(async () => {
      if (server.getAudioClientCount() > 0) {
        console.log("Restarting audio for connected clients...");
        await server.restartAudio();
      }
    }, 1500);
  },
  onDisconnect: () => {
    console.log("M8 disconnected, waiting for reconnect...");
  },
  onError: (err) => {
    // Only log non-trivial errors
    if (!err.message.includes("Resource temporarily unavailable")) {
      console.error("M8 error:", err.message);
    }
  },
});

// Setup TCP proxy if enabled
if (tcpProxyPort > 0) {
  tcpProxy = new TcpProxy({
    port: tcpProxyPort,
    onClientData: async (data) => {
      // Forward client data to M8
      await connection.sendRaw(data);
    },
    onConnect: (id) => {
      console.log(`Remote m8c connected: ${id}`);
    },
    onDisconnect: (id) => {
      console.log(`Remote m8c disconnected: ${id}`);
    },
  });
}

const server = new M8Server({
  port: parseInt(values.http || "8080"),
  connection,
  buffer,
  framebuffer,
  // Stream audio to TCP clients (enabled - uses 'A' + length framing)
  onAudioData: tcpProxy ? (data) => tcpProxy!.broadcastAudio(data) : undefined,
});

// Start server (even if M8 not connected yet)
server.start();

// Start TCP proxy if enabled
if (tcpProxy) {
  await tcpProxy.start();
}

// Try to connect to M8 (will auto-reconnect if fails)
// Note: enable() is called in onConnect callback, don't call it here
try {
  await connection.connect();
} catch {
  console.log("Waiting for M8 to connect...");
}

const tcpInfo = tcpProxy
  ? `  TCP Proxy: tcp://0.0.0.0:${tcpProxyPort} (for remote m8c)\n`
  : "";

console.log(`
M8 Display Server started!

  Serial:    ${serialPort || "(auto-detect)"}
  HTTP:      http://localhost:${values.http || "8080"}
  WebSocket: ws://localhost:${values.http || "8080"}/ws
${tcpInfo}
API:
  GET  /api/health       - Connection status
  GET  /api/screen       - Text buffer (JSON)
  GET  /api/screen/text  - Text buffer (plain)
  POST /api/key/:key     - Send key (up/down/left/right/shift/start/opt/edit)
  POST /api/keys         - Send combo {"hold":"shift","press":"up"}
  POST /api/note         - Note on {"note":60,"vel":100}
  POST /api/note/off     - Note off
  POST /api/reset        - Reset display

Press Ctrl+C to stop.
`);

// Graceful shutdown
async function shutdown() {
  console.log("\nShutting down...");
  server.stop();
  if (tcpProxy) {
    await tcpProxy.stop();
  }
  await connection.disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
