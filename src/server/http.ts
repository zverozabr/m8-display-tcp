/**
 * M8 HTTP API Server (Node.js version)
 * REST endpoints for M8 control
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { M8Connection } from "../serial/connection";
import type { TextBuffer } from "../display/buffer";
import type { Framebuffer } from "../display/framebuffer";
import { keyToBitmask, isValidKey, createCombo } from "../input/keys";
import type { M8KeyName, ParsedCommand, M8Screen } from "../state/types";
import { M8StateTracker } from "../state/tracker";
import { AudioRecorder, getAudioDevices, findM8AudioDevice } from "../audio/capture";
import { UsbAudioStreamer } from "../audio/usb-streamer";
import {
  resetM8Usb,
  resetLevel1,
  resetLevel2,
  resetLevel3,
  resetLevel4_D3cold,
  resetLevel5_MultiCycle,
  resetLevel6_RuntimePM,
  forceHardReset,
  resetAllControllers,
  ultimateReset,
  getM8UsbInfo,
  type ResetResult
} from "../usb/reset";
import { spawn } from "child_process";

// Get directory of this file for static serving
const __dirname = dirname(fileURLToPath(import.meta.url));

export interface M8ServerOptions {
  port?: number;
  connection: M8Connection;
  buffer: TextBuffer;
  framebuffer?: Framebuffer;
  onAudioData?: (data: Buffer) => void; // For TCP audio streaming
}

interface WebSocketData {
  id: string;
}

/**
 * M8 HTTP/WebSocket Server
 */
export class M8Server {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private connection: M8Connection;
  private buffer: TextBuffer;
  private framebuffer: Framebuffer | null;
  private port: number;
  private clients: Map<WebSocket, WebSocketData> = new Map(); // Legacy /ws
  private controlClients: Set<WebSocket> = new Set();         // /control - input only
  private screenClients: Set<WebSocket> = new Set();          // /screen - BMP images
  private displayClients: Set<WebSocket> = new Set();         // /display - SLIP for m8c
  private stateTracker: M8StateTracker;
  private screenBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private screenDirty = false;
  private jpegBroadcastInterval: ReturnType<typeof setInterval> | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private audioStreamer: UsbAudioStreamer;

  constructor(options: M8ServerOptions) {
    this.connection = options.connection;
    this.buffer = options.buffer;
    this.framebuffer = options.framebuffer ?? null;
    this.port = options.port ?? 8080;
    this.stateTracker = new M8StateTracker();
    // Auto-start audio if TCP streaming is enabled
    this.audioStreamer = new UsbAudioStreamer({
      onAudioData: options.onAudioData,
      autoStart: !!options.onAudioData, // Start immediately for TCP clients
    });
  }

  /**
   * Start server
   */
  start(): void {
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on("connection", (ws, req) => {
      // Extract pathname without query string
      const url = req.url || "/";
      const path = url.split("?")[0];

      // Audio streaming WebSocket
      if (path === "/audio") {
        console.log("Audio client connected");
        this.audioStreamer.addClient(ws);
        return;
      }

      // Display streaming WebSocket (raw SLIP frames for m8c-websocket)
      if (path === "/display") {
        console.log("Display client connected");
        this.displayClients.add(ws);
        ws.on("close", () => {
          console.log("Display client disconnected");
          this.displayClients.delete(ws);
        });
        return;
      }

      // Control WebSocket (input only - JSON messages)
      if (path === "/control") {
        console.log("Control client connected");
        this.controlClients.add(ws);
        ws.on("message", (message) => {
          this.handleWsMessage(ws, message.toString());
        });
        ws.on("close", () => {
          console.log("Control client disconnected");
          this.controlClients.delete(ws);
        });
        return;
      }

      // Screen WebSocket (JPEG images at 10 FPS)
      if (path === "/screen") {
        console.log("Screen client connected (JPEG mode)");
        this.screenClients.add(ws);
        ws.binaryType = "nodebuffer";
        ws.on("close", () => {
          console.log("Screen client disconnected");
          this.screenClients.delete(ws);
        });
        return;
      }

      // Regular control WebSocket (legacy - supports both input and screen)
      const data: WebSocketData = { id: crypto.randomUUID() };
      this.clients.set(ws, data);
      console.log(`WebSocket connected (legacy /ws): ${data.id}`);

      ws.on("message", (message) => {
        this.handleWsMessage(ws, message.toString());
      });

      ws.on("close", () => {
        console.log(`WebSocket disconnected: ${data.id}`);
        this.clients.delete(ws);
      });
    });

    this.server.listen(this.port, () => {
      console.log(`M8 Server running on http://localhost:${this.port}`);
    });

    // Start JPEG broadcast to /screen clients (10 FPS)
    this.startJpegBroadcast();
  }

  /**
   * Start JPEG broadcast interval (10 FPS = 100ms)
   */
  private jpegCount = 0;
  private startJpegBroadcast(): void {
    this.jpegBroadcastInterval = setInterval(async () => {
      if (this.screenClients.size === 0 || !this.framebuffer) return;

      try {
        const jpeg = await this.framebuffer.toJPEG(70);
        this.jpegCount++;
        if (this.jpegCount % 50 === 0) {
          console.log(`JPEG broadcast #${this.jpegCount}, size=${jpeg.length}, clients=${this.screenClients.size}`);
        }
        for (const ws of this.screenClients) {
          if (ws.readyState === ws.OPEN) {
            ws.send(jpeg);
          }
        }
      } catch (err) {
        console.error("JPEG broadcast error:", err);
      }
    }, 100);
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://localhost:${this.port}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // API routes
      if (path.startsWith("/api/")) {
        await this.handleApi(req, res, path.replace("/api/", ""));
        return;
      }

      // Static files - serve web UI
      if (path === "/" || path === "/index.html") {
        const htmlPath = join(__dirname, "../web/index.html");
        try {
          const content = await readFile(htmlPath, "utf-8");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end("Not Found");
        }
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    } catch (err) {
      console.error("Request error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }

  /**
   * Handle API requests
   */
  private async handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const method = req.method || "GET";

    // GET /api/health
    if (path === "health" && method === "GET") {
      this.json(res, {
        connected: this.connection.isConnected(),
        port: this.connection.getPort(),
        clients: this.clients.size,
      });
      return;
    }

    // GET /api/screen
    if (path === "screen" && method === "GET") {
      this.json(res, this.buffer.toJSON());
      return;
    }

    // GET /api/screen/text
    if (path === "screen/text" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(this.buffer.toText());
      return;
    }

    // POST /api/raw - Send raw bitmask (low-level direct control)
    if (path === "raw" && method === "POST") {
      const body = await this.parseBody(req);
      const { bitmask, holdMs, release } = body as { bitmask: number; holdMs?: number; release?: boolean };
      if (typeof bitmask !== "number" || bitmask < 0 || bitmask > 255) {
        this.json(res, { error: "Invalid bitmask (0-255)" }, 400);
        return;
      }
      await this.connection.sendKeys(bitmask);
      if (holdMs && holdMs > 0) {
        await this.delay(holdMs);
        if (release !== false) {
          await this.connection.sendKeys(0);
        }
      }
      this.json(res, { ok: true, bitmask, holdMs });
      return;
    }

    // GET /api/screen/image - Pixel-perfect M8 display
    if (path === "screen/image" && method === "GET") {
      if (!this.framebuffer) {
        this.json(res, { error: "Framebuffer not available" }, 500);
        return;
      }
      const bmp = this.framebuffer.toBMP();
      res.writeHead(200, {
        "Content-Type": "image/bmp",
        "Content-Length": bmp.length,
        "Cache-Control": "no-cache",
      });
      res.end(Buffer.from(bmp));
      return;
    }

    // POST /api/key/:key
    if (path.startsWith("key/") && method === "POST") {
      const key = path.replace("key/", "");
      if (!isValidKey(key)) {
        this.json(res, { error: `Invalid key: ${key}` }, 400);
        return;
      }
      await this.pressKey(key);
      this.json(res, { ok: true, key });
      return;
    }

    // POST /api/keys (combo)
    if (path === "keys" && method === "POST") {
      const body = await this.parseBody(req);
      const { hold, press } = body as { hold?: string; press?: string };

      if (press && isValidKey(press)) {
        if (hold && isValidKey(hold)) {
          await this.pressCombo(hold, press);
        } else {
          await this.pressKey(press);
        }
        this.json(res, { ok: true, hold, press });
        return;
      }
      this.json(res, { error: "Invalid keys" }, 400);
      return;
    }

    // POST /api/note
    if (path === "note" && method === "POST") {
      const body = await this.parseBody(req);
      const { note, vel } = body as { note: number; vel?: number };
      await this.connection.sendNoteOn(note, vel ?? 100);
      this.json(res, { ok: true, note, vel: vel ?? 100 });
      return;
    }

    // POST /api/note/off
    if (path === "note/off" && method === "POST") {
      await this.connection.sendNoteOff();
      this.json(res, { ok: true });
      return;
    }

    // POST /api/reset
    if (path === "reset" && method === "POST") {
      await this.connection.reset();
      this.stateTracker.reset();
      this.json(res, { ok: true });
      return;
    }

    // GET /api/state
    if (path === "state" && method === "GET") {
      this.json(res, this.stateTracker.toJSON());
      return;
    }

    // POST /api/state/set
    if (path === "state/set" && method === "POST") {
      const body = await this.parseBody(req) as Partial<{
        screen: M8Screen;
        number: number;
        row: number;
        col: number;
        confidence: number;
        chainNum: number;
        chainRow: number;
      }>;
      this.stateTracker.setState(body);
      this.json(res, this.stateTracker.toJSON());
      return;
    }

    // POST /api/state/chain
    if (path === "state/chain" && method === "POST") {
      const body = await this.parseBody(req) as { chain: number; phrases: number[] };
      if (typeof body.chain === "number" && Array.isArray(body.phrases)) {
        this.stateTracker.setChain(body.chain, body.phrases);
        this.json(res, { ok: true, chain: body.chain, phrases: body.phrases });
      } else {
        this.json(res, { error: "Invalid chain data" }, 400);
      }
      return;
    }

    // GET /api/state/chain
    if (path.startsWith("state/chain") && method === "GET") {
      const chainNum = path.replace("state/chain/", "");
      if (chainNum && chainNum !== "state/chain") {
        this.json(res, this.stateTracker.getChain(parseInt(chainNum)));
      } else {
        this.json(res, this.stateTracker.getChain());
      }
      return;
    }

    // GET /api/state/song
    if (path === "state/song" && method === "GET") {
      this.json(res, this.stateTracker.getSongStructure());
      return;
    }

    // POST /api/state/verify
    if (path === "state/verify" && method === "POST") {
      this.stateTracker.verify();
      this.json(res, this.stateTracker.toJSON());
      return;
    }

    // GET /api/audio/devices
    if (path === "audio/devices" && method === "GET") {
      const devices = await getAudioDevices();
      const m8Device = await findM8AudioDevice();
      this.json(res, { devices, m8Device });
      return;
    }

    // POST /api/audio/start
    if (path === "audio/start" && method === "POST") {
      if (this.audioRecorder?.isRecording()) {
        this.json(res, { error: "Already recording" }, 400);
        return;
      }
      const body = await this.parseBody(req) as { device?: string };
      const device = body.device || (await findM8AudioDevice()) || "hw:M8";
      this.audioRecorder = new AudioRecorder({ device });
      const outputPath = await this.audioRecorder.start();
      this.json(res, { ok: true, recording: true, path: outputPath });
      return;
    }

    // POST /api/audio/stop
    if (path === "audio/stop" && method === "POST") {
      if (!this.audioRecorder?.isRecording()) {
        this.json(res, { error: "Not recording" }, 400);
        return;
      }
      const result = await this.audioRecorder.stop();
      this.json(res, { ok: true, ...result });
      return;
    }

    // GET /api/usb/info - USB device info
    if (path === "usb/info" && method === "GET") {
      const info = await getM8UsbInfo();
      this.json(res, info || { error: "M8 not found" }, info ? 200 : 404);
      return;
    }

    // POST /api/usb/reset - Auto-escalating reset (levels 1→2→3)
    if (path === "usb/reset" && method === "POST") {
      const result = await resetM8Usb(1, 3);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/1 - Level 1 (soft, authorized only)
    if (path === "usb/reset/1" && method === "POST") {
      const result = await resetLevel1(1000);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/2 - Level 2 (remove + rescan)
    if (path === "usb/reset/2" && method === "POST") {
      const result = await resetLevel2(2000);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/3 - Level 3 (xhci unbind/rebind - HARD)
    if (path === "usb/reset/3" && method === "POST") {
      const result = await resetLevel3(5000);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/force - Force hard reset with 10s delay
    if (path === "usb/reset/force" && method === "POST") {
      const body = await this.parseBody(req) as { delayMs?: number };
      const delayMs = body.delayMs || 10000;
      const result = await forceHardReset(delayMs);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/nuclear - Reset ALL USB controllers (15s+ delay)
    // WARNING: Will disconnect ALL USB devices temporarily!
    if (path === "usb/reset/nuclear" && method === "POST") {
      const body = await this.parseBody(req) as { delayMs?: number };
      const delayMs = body.delayMs || 15000;
      const result = await resetAllControllers(delayMs);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/d3cold - Level 4: PCI D3cold state
    // Forces PCI device into deepest power state (needs 60s+ for reliable recovery)
    if (path === "usb/reset/d3cold" && method === "POST") {
      const body = await this.parseBody(req) as { delayMs?: number };
      const delayMs = body.delayMs || 60000;
      const result = await resetLevel4_D3cold(delayMs);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/multi - Level 5: Multiple cycles
    // Try multiple reset cycles with increasing delays
    if (path === "usb/reset/multi" && method === "POST") {
      const body = await this.parseBody(req) as { cycles?: number; delayMs?: number };
      const cycles = body.cycles || 3;
      const delayMs = body.delayMs || 30000;
      const result = await resetLevel5_MultiCycle(cycles, delayMs);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/pm - Level 6: Runtime PM manipulation
    if (path === "usb/reset/pm" && method === "POST") {
      const body = await this.parseBody(req) as { delayMs?: number };
      const delayMs = body.delayMs || 10000;
      const result = await resetLevel6_RuntimePM(delayMs);
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /api/usb/reset/ultimate - Try EVERYTHING
    // Last resort before physical unplug
    if (path === "usb/reset/ultimate" && method === "POST") {
      const result = await ultimateReset();
      this.json(res, result, result.success ? 200 : 500);
      return;
    }

    // GET /api/audio/record?duration=N
    if (path === "audio/record" && method === "GET") {
      const url = new URL(req.url || "/", `http://localhost:${this.port}`);
      const durationStr = url.searchParams.get("duration") || "5";
      const duration = parseInt(durationStr);

      if (duration < 1 || duration > 300) {
        this.json(res, { error: "Duration must be 1-300 seconds" }, 400);
        return;
      }

      const device = (await findM8AudioDevice()) || "hw:M8";
      const recorder = new AudioRecorder({ device });

      try {
        const result = await recorder.record(duration);
        const wavData = await readFile(result.path);
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Content-Length": wavData.length,
          "Content-Disposition": `attachment; filename="m8_recording.wav"`,
        });
        res.end(wavData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Recording failed";
        this.json(res, { error: msg }, 500);
      }
      return;
    }

    this.json(res, { error: "Not found" }, 404);
  }

  /**
   * Parse request body as JSON
   */
  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          reject(new Error("Invalid JSON"));
        }
      });
      req.on("error", reject);
    });
  }

  /**
   * Handle WebSocket message
   */
  private async handleWsMessage(ws: WebSocket, message: string): Promise<void> {
    try {
      const data = JSON.parse(message);
      console.log("WS message:", data.type, data.key || data.press || "");

      switch (data.type) {
        case "key":
          if (isValidKey(data.key)) {
            await this.pressKey(data.key);
          }
          break;

        case "keys":
          if (data.press && isValidKey(data.press)) {
            if (data.hold && isValidKey(data.hold)) {
              await this.pressCombo(data.hold, data.press);
            } else {
              await this.pressKey(data.press);
            }
          }
          break;

        case "note":
          await this.connection.sendNoteOn(data.note, data.vel ?? 100);
          break;

        case "noteOff":
          await this.connection.sendNoteOff();
          break;
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  }

  /**
   * Press single key
   */
  private async pressKey(key: M8KeyName): Promise<void> {
    const bitmask = keyToBitmask(key);
    console.log("pressKey:", key, "bitmask:", bitmask);
    await this.connection.sendKeys(bitmask);
    await this.delay(50);
    await this.connection.sendKeys(0);
    // Update state tracker
    this.stateTracker.onKey(key);
  }

  /**
   * Press key combo
   */
  private async pressCombo(hold: M8KeyName, press: M8KeyName): Promise<void> {
    const sequence = createCombo(hold, press);
    for (const step of sequence) {
      await this.connection.sendKeys(step.bitmask);
      if (step.duration > 0) {
        await this.delay(step.duration);
      }
    }
    // Update state tracker
    this.stateTracker.onCombo(hold, press);
  }

  /**
   * Broadcast to all WebSocket clients
   */
  broadcast(data: object): void {
    const message = JSON.stringify(data);
    for (const [ws] of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Broadcast raw display data (SLIP frames) to display clients
   * Used by m8c-websocket for clean binary streaming
   */
  broadcastDisplay(data: Uint8Array): void {
    for (const ws of this.displayClients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcast command to clients
   */
  broadcastCommand(cmd: ParsedCommand): void {
    // Send to legacy /ws clients
    this.broadcast({ type: cmd.type, data: cmd });

    // /screen clients now receive JPEG via interval (see startJpegBroadcast)

    // Mark screen as dirty for throttled BMP broadcast (legacy only)
    if (this.clients.size > 0) {
      this.screenDirty = true;
      this.scheduleScreenBroadcast();
    }
  }

  /**
   * Schedule screen broadcast with throttling (max 30 FPS)
   * Only for legacy /ws clients (BMP images)
   * /screen clients receive commands directly via broadcastScreenCommand
   */
  private scheduleScreenBroadcast(): void {
    if (this.screenBroadcastTimer) return; // Already scheduled

    this.screenBroadcastTimer = setTimeout(() => {
      this.screenBroadcastTimer = null;
      if (this.screenDirty && this.framebuffer && this.clients.size > 0) {
        this.screenDirty = false;
        this.broadcastScreenImage();
      }
    }, 33); // ~30 FPS max
  }

  /**
   * Broadcast screen image to legacy /ws clients only
   * /screen clients now receive commands via broadcastScreenCommand
   */
  private broadcastScreenImage(): void {
    if (!this.framebuffer || this.clients.size === 0) return;

    const bmp = this.framebuffer.toBMP();
    const data = new Uint8Array(1 + bmp.length);
    data[0] = 0x02; // Screen image type
    data.set(bmp, 1);

    for (const [ws] of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * JSON response helper
   */
  private json(res: ServerResponse, data: object, status = 200): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stop server
   */
  stop(): void {
    if (this.jpegBroadcastInterval) {
      clearInterval(this.jpegBroadcastInterval);
      this.jpegBroadcastInterval = null;
    }
    this.audioStreamer.stop();
    this.wss?.close();
    this.server?.close();
    this.server = null;
    this.wss = null;
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Restart audio streaming (called after USB reconnect)
   */
  async restartAudio(): Promise<void> {
    await this.audioStreamer.restart();
  }

  /**
   * Get audio client count
   */
  getAudioClientCount(): number {
    return this.audioStreamer.getClientCount();
  }
}
