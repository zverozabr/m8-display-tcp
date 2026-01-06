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
import { config } from "./config";

// Parse CLI arguments (override ENV defaults)
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: "string", short: "p", default: config.SERIAL_PORT },
    http: { type: "string", short: "h", default: String(config.HTTP_PORT) },
    "tcp-proxy": { type: "string", short: "t", default: String(config.TCP_PORT) },
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
  -h, --http <port>      HTTP server port (default: ${config.HTTP_PORT})
  -t, --tcp-proxy <port> TCP proxy port for remote m8c (default: ${config.TCP_PORT}, 0 to disable)
  -l, --list             List available serial ports
  --help                 Show this help

Environment Variables (overridden by CLI args):
  M8_HTTP_PORT          HTTP server port (default: 8080)
  M8_TCP_PORT           TCP proxy port (default: 3333, 0 to disable)
  M8_SERIAL_PORT        Serial port (auto-detect if empty)
  M8_BAUD_RATE          Serial baud rate (default: 115200)
  M8_AUDIO_ENABLED      Enable audio streaming (default: true)
  M8_AUTO_RECONNECT     Auto-reconnect on disconnect (default: true)
  M8_RECONNECT_INTERVAL Reconnect interval in ms (default: 1000)
  M8_LOG_LEVEL          Log level: debug, info, warn, error (default: info)

Examples:
  npx tsx src/index.ts                           # HTTP:8080 + TCP:3333
  npx tsx src/index.ts -p /dev/ttyACM0           # Specific port
  npx tsx src/index.ts -t 0                      # Disable TCP proxy
  M8_HTTP_PORT=9000 npx tsx src/index.ts         # HTTP:9000 via ENV
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

// Debug statistics for QA analysis
const debugStats = {
  textCommands: 0,
  rectCommands: 0,
  waveCommands: 0,
  whiteTextCount: 0,      // TEXT with fg color (248,248,248)
  smallRects: 0,          // RECT with width or height <= 3 (corner brackets)
  rectSizes: new Map<string, number>(),  // Count by size
  fgColors: new Map<string, number>(),   // Count by fg color
  reset() {
    this.textCommands = 0;
    this.rectCommands = 0;
    this.waveCommands = 0;
    this.whiteTextCount = 0;
    this.smallRects = 0;
    this.rectSizes.clear();
    this.fgColors.clear();
  },
  toJSON() {
    return {
      textCommands: this.textCommands,
      rectCommands: this.rectCommands,
      waveCommands: this.waveCommands,
      whiteTextCount: this.whiteTextCount,
      smallRects: this.smallRects,
      rectSizes: Object.fromEntries(this.rectSizes),
      fgColors: Object.fromEntries(this.fgColors),
    };
  }
};

// TCP Proxy (optional)
let tcpProxy: TcpProxy | null = null;
const tcpProxyPort = values["tcp-proxy"] ? parseInt(values["tcp-proxy"]) : 0;

const connection = new M8Connection({
  port: serialPort,
  baudRate: config.BAUD_RATE,
  autoReconnect: config.AUTO_RECONNECT,
  reconnectInterval: config.RECONNECT_INTERVAL,
  onCommand: (cmd: ParsedCommand) => {
    // Update text buffer
    if (cmd.type === "text") {
      buffer.applyText(cmd);
      framebuffer.applyText(cmd);

      // Debug: track text commands and colors
      debugStats.textCommands++;
      const fgKey = `${cmd.fg.r},${cmd.fg.g},${cmd.fg.b}`;
      debugStats.fgColors.set(fgKey, (debugStats.fgColors.get(fgKey) || 0) + 1);
      // Track white foreground (selection highlight)
      if (cmd.fg.r >= 240 && cmd.fg.g >= 240 && cmd.fg.b >= 240) {
        debugStats.whiteTextCount++;
      }
      // Log first few TEXT commands to see Y coordinates
      if (debugStats.textCommands <= 30) {
        console.log(`TEXT #${debugStats.textCommands}: '${cmd.char}' at (${cmd.x},${cmd.y}) fg=${fgKey}`);
      }
    } else if (cmd.type === "rect") {
      buffer.applyRect(cmd);
      framebuffer.applyRect(cmd);

      // Debug: track rect commands
      debugStats.rectCommands++;
      const sizeKey = `${cmd.width}x${cmd.height}`;
      debugStats.rectSizes.set(sizeKey, (debugStats.rectSizes.get(sizeKey) || 0) + 1);
      // Track small rects (corner brackets)
      if (cmd.width <= 3 || cmd.height <= 3) {
        debugStats.smallRects++;
      }
      // Track large rects (potential screen clears)
      if (cmd.width > 100 || cmd.height > 100) {
        const colorKey = `${cmd.color.r},${cmd.color.g},${cmd.color.b}`;
        console.log(`LARGE RECT: ${cmd.x},${cmd.y} ${cmd.width}x${cmd.height} color=${colorKey}`);
      }
      // Log gray rects (selection background)
      if (cmd.color.r === 96 && cmd.color.g === 96 && debugStats.rectCommands <= 50) {
        console.log(`GRAY_RECT: ${cmd.x},${cmd.y} ${cmd.width}x${cmd.height}`);
      }
    } else if (cmd.type === "wave") {
      framebuffer.applyWave(cmd);
      debugStats.waveCommands++;
    }

    // Broadcast to WebSocket clients
    server.broadcastCommand(cmd);
  },
  onSerialData: (data: Uint8Array) => {
    // Forward raw serial bytes to WebSocket display clients (new)
    server.broadcastDisplay(data);

    // Forward to TCP proxy clients (legacy, for backward compatibility)
    if (tcpProxy) {
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
  // Debug statistics for QA analysis
  getDebugStats: () => debugStats.toJSON(),
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
