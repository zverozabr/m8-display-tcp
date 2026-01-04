/**
 * M8 Audio Streaming
 * Streams audio from M8 USB device to WebSocket clients
 */

import { spawn, type ChildProcess } from "child_process";
import type { WebSocket } from "ws";
import { findM8AudioDevice } from "./capture";

export interface AudioStreamOptions {
  device?: string;
  sampleRate?: number;
  channels?: number;
}

/**
 * Audio Streamer - captures from ALSA and sends to WebSocket clients
 */
export class AudioStreamer {
  private process: ChildProcess | null = null;
  private clients: Set<WebSocket> = new Set();
  private options: Required<AudioStreamOptions>;
  private running = false;
  private detectedDevice: string | null = null;

  constructor(options: AudioStreamOptions = {}) {
    this.options = {
      device: options.device ?? "",
      sampleRate: options.sampleRate ?? 44100,
      channels: options.channels ?? 2,
    };
  }

  /**
   * Add WebSocket client for audio streaming
   */
  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`Audio client added, total: ${this.clients.size}`);

    // Start streaming if first client
    if (this.clients.size === 1 && !this.running) {
      this.start().catch((err) => {
        console.error("Failed to start audio stream:", err);
      });
    }

    ws.on("close", () => {
      this.clients.delete(ws);
      console.log(`Audio client removed, total: ${this.clients.size}`);

      // Stop streaming if no clients
      if (this.clients.size === 0) {
        this.stop();
      }
    });
  }

  /**
   * Start audio capture
   */
  private async start(): Promise<void> {
    if (this.running) return;

    // Auto-detect M8 device if not specified
    let device = this.options.device;
    if (!device) {
      device = await findM8AudioDevice();
      if (!device) {
        const errorMsg = "M8 audio device not found";
        console.error(errorMsg);
        this.broadcastError(errorMsg);
        return;
      }
      this.detectedDevice = device;
    }

    console.log(`Starting audio stream from ${device}`);

    // Use arecord to capture raw PCM
    this.process = spawn("arecord", [
      "-D", device,
      "-f", "S16_LE",
      "-r", String(this.options.sampleRate),
      "-c", String(this.options.channels),
      "-t", "raw",
      "-q", // quiet
      "-", // stdout
    ]);

    this.running = true;

    this.process.stdout?.on("data", (data: Buffer) => {
      this.broadcast(data);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error("Audio error:", data.toString());
    });

    this.process.on("error", (err) => {
      console.error("Audio process error:", err);
      this.running = false;
    });

    this.process.on("close", (code) => {
      console.log(`Audio process exited with code ${code}`);
      if (code !== 0) {
        this.broadcastError(`Audio capture failed (code ${code})`);
      }
      this.running = false;
      this.process = null;
    });
  }

  /**
   * Stop audio capture
   */
  stop(): void {
    if (this.process) {
      console.log("Stopping audio stream");
      this.process.kill("SIGTERM");
      this.process = null;
      this.running = false;
    }
  }

  // Message type prefixes for framing protocol
  private static readonly MSG_AUDIO = 0x00;
  private static readonly MSG_CONTROL = 0x01;

  /**
   * Broadcast audio data to all clients (framed with 0x00 prefix)
   */
  private broadcast(data: Buffer): void {
    // Frame: [0x00] + PCM data
    const framed = Buffer.concat([Buffer.from([AudioStreamer.MSG_AUDIO]), data]);
    const dead: WebSocket[] = [];

    for (const client of this.clients) {
      if (client.readyState !== client.OPEN) {
        dead.push(client);
        continue;
      }
      try {
        client.send(framed);
      } catch {
        dead.push(client);
      }
    }
    // Clean up dead clients
    dead.forEach((c) => this.clients.delete(c));
  }

  /**
   * Broadcast error/control message to all clients (framed with 0x01 prefix)
   */
  private broadcastError(message: string): void {
    // Frame: [0x01] + JSON
    const json = Buffer.from(JSON.stringify({ error: message }));
    const payload = Buffer.concat([Buffer.from([AudioStreamer.MSG_CONTROL]), json]);

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        try {
          client.send(payload);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Check if streaming
   */
  isStreaming(): boolean {
    return this.running;
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Restart audio stream (force re-detect device)
   */
  async restart(): Promise<void> {
    console.log("Restarting audio stream...");
    this.stop();
    this.detectedDevice = null; // Force re-detection

    // Wait for audio device to appear after USB reconnect
    await new Promise((r) => setTimeout(r, 1000));

    if (this.clients.size > 0) {
      await this.start();
    }
  }
}
