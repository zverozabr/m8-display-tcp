/**
 * AlsaCapture - ALSA-based audio capture via arecord
 * Fallback when libusb can't detach kernel driver (needs root)
 */

import { spawn, type ChildProcess } from "child_process";
import type { IAudioCapture, AudioCaptureOptions } from "./native-capture";
import { findM8AudioDevice } from "./capture";

/**
 * ALSA-based capture using arecord
 * Works without root, but requires M8 to be recognized by snd-usb-audio
 */
export class AlsaCapture implements IAudioCapture {
  private process: ChildProcess | null = null;
  private running = false;
  private readonly onData: (data: Buffer) => void;
  private readonly onError: (error: Error) => void;
  private device: string | null = null;

  constructor(options: AudioCaptureOptions) {
    this.onData = options.onData;
    this.onError = options.onError ?? ((err) => console.error("[AlsaCapture]", err.message));
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Find M8 device
    this.device = await findM8AudioDevice();
    if (!this.device) {
      throw new Error("M8 audio device not found");
    }

    console.log(`[AlsaCapture] Starting audio from ${this.device}`);

    // Spawn arecord
    this.process = spawn("arecord", [
      "-D", this.device,
      "-f", "S16_LE",
      "-r", "44100",
      "-c", "2",
      "-t", "raw",
      "-q",
      "-",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.running = true;

    let totalBytes = 0;
    let lastLog = Date.now();
    this.process.stdout?.on("data", (data: Buffer) => {
      totalBytes += data.length;
      const now = Date.now();
      if (now - lastLog > 5000) {
        console.log(`[AlsaCapture] Received ${totalBytes} bytes (${data.length} this chunk)`);
        totalBytes = 0;
        lastLog = now;
      }
      this.onData(data);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error("[AlsaCapture]", msg);
      }
    });

    this.process.on("error", (err) => {
      this.onError(err);
      this.running = false;
    });

    this.process.on("close", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[AlsaCapture] Process exited with code ${code}`);
      }
      this.running = false;
    });
  }

  async stop(): Promise<void> {
    if (!this.running || !this.process) return;

    this.process.kill("SIGTERM");
    this.process = null;
    this.running = false;
  }
}
