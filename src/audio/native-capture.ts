/**
 * NativeLibusbCapture - Audio capture via native libusb tool
 *
 * Uses compiled m8-audio-capture binary that directly accesses USB
 * isochronous endpoint 0x85, bypassing PipeWire/ALSA.
 *
 * Reference: m8c-src/src/backends/audio_libusb.c
 *
 * SOLID Principles:
 * - Single Responsibility: Only handles native tool spawning
 * - Open/Closed: Implements IAudioCapture interface
 * - Liskov Substitution: Can replace any IAudioCapture
 * - Interface Segregation: Minimal interface
 * - Dependency Inversion: Depends on abstraction (IAudioCapture)
 */

import { spawn, type ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

// ES module __dirname equivalent
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Audio constants matching m8c/src/backends/audio_libusb.c
 */
export const AUDIO_CONSTANTS = {
  // M8 USB identifiers
  VID: 0x16c0,
  PID_MODEL_02: 0x048a,
  PID_HEADLESS: 0x048b,

  // USB audio endpoint
  EP_ISO_IN: 0x85,
  IFACE_NUM: 4,
  ALT_SETTING: 1,

  // Transfer parameters
  NUM_TRANSFERS: 64,
  PACKET_SIZE: 180,
  NUM_PACKETS: 2,

  // Audio format (S16_LE stereo 44100Hz)
  SAMPLE_RATE: 44100,
  CHANNELS: 2,
  BITS_PER_SAMPLE: 16,

  // Buffer sizes
  RING_BUFFER_SIZE: 256 * 1024,
  PREBUFFER_SIZE: 8 * 1024,
} as const;

/**
 * Audio capture interface (SOLID: Interface Segregation)
 */
export interface IAudioCapture {
  /** Start capturing audio */
  start(): Promise<void>;
  /** Stop capturing audio */
  stop(): Promise<void>;
  /** Check if currently running */
  readonly isRunning: boolean;
}

/**
 * Options for audio capture
 */
export interface AudioCaptureOptions {
  /** Callback when PCM data received */
  onData: (data: Buffer) => void;
  /** Callback on error (optional) */
  onError?: (error: Error) => void;
  /** Path to native tool (optional, auto-detected) */
  toolPath?: string;
}

/**
 * Native libusb audio capture implementation
 *
 * Spawns m8-audio-capture tool and reads PCM data from stdout.
 * The native tool handles all USB isochronous transfer complexity.
 */
export class NativeLibusbCapture implements IAudioCapture {
  private process: ChildProcess | null = null;
  private running = false;
  private readonly onData: (data: Buffer) => void;
  private readonly onError: (error: Error) => void;
  private readonly toolPath: string;

  constructor(options: AudioCaptureOptions) {
    this.onData = options.onData;
    this.onError = options.onError ?? ((err) => console.error("[NativeCapture]", err.message));
    this.toolPath = options.toolPath ?? this.findToolPath();
  }

  /**
   * Find native tool in common locations
   */
  private findToolPath(): string {
    const candidates = [
      resolve(__dirname, "../../tools/m8-audio-capture"),
      resolve(process.cwd(), "tools/m8-audio-capture"),
      "/usr/local/bin/m8-audio-capture",
    ];

    for (const path of candidates) {
      if (existsSync(path)) {
        return path;
      }
    }

    throw new Error(
      `Native tool not found. Tried: ${candidates.join(", ")}. ` +
      `Build with: gcc -o tools/m8-audio-capture tools/m8-audio-capture.c -lusb-1.0`
    );
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Start audio capture
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Verify tool exists
    if (!existsSync(this.toolPath)) {
      throw new Error(`Native tool not found: ${this.toolPath}`);
    }

    // Spawn native process
    this.process = spawn(this.toolPath, [], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.running = true;

    // Handle stdout (PCM data)
    this.process.stdout?.on("data", (data: Buffer) => {
      this.onData(data);
    });

    // Handle stderr (status messages)
    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      // Filter out normal status messages
      if (msg && !msg.includes("started") && !msg.includes("Streaming")) {
        console.error("[NativeCapture]", msg);
      }
    });

    // Handle process errors
    this.process.on("error", (err) => {
      this.onError(err);
      this.running = false;
    });

    // Handle process exit
    this.process.on("close", (code) => {
      if (code !== 0 && code !== null && this.running) {
        this.onError(new Error(`Native capture exited with code ${code}`));
      }
      this.running = false;
      this.process = null;
    });

    // Wait briefly to catch immediate errors
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 100);

      this.process?.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.process?.on("close", (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Native capture failed to start (code ${code})`));
        }
      });
    });
  }

  /**
   * Stop audio capture
   */
  async stop(): Promise<void> {
    if (!this.running || !this.process) {
      return;
    }

    this.running = false;

    // Send SIGTERM
    this.process.kill("SIGTERM");

    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still running
        if (this.process) {
          this.process.kill("SIGKILL");
        }
        resolve();
      }, 1000);

      this.process?.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
  }
}

/**
 * Factory function to create audio capture instance
 * DRY: Single place to choose capture backend
 */
export function createAudioCapture(options: AudioCaptureOptions): IAudioCapture {
  // For now, always use native capture
  // Future: could add PipeWire fallback here
  return new NativeLibusbCapture(options);
}
