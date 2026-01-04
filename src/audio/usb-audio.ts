/**
 * UsbAudioCapture - Audio capture for M8 Tracker
 * Uses pw-record (PipeWire) for reliable audio capture
 * Falls back to arecord if PipeWire not available
 */

import { spawn, type ChildProcess } from "child_process";

/**
 * Audio constants for M8
 */
export const USB_AUDIO_CONSTANTS = {
  // M8 USB identifiers (for reference)
  VID: 0x16c0,
  PID_MODEL_02: 0x048a,
  PID_HEADLESS: 0x048b,

  // USB endpoints (for reference - not used in PipeWire mode)
  EP_ISO_IN: 0x85,
  IFACE_NUM: 4,
  ALT_SETTING: 1,
  NUM_TRANSFERS: 64,
  PACKET_SIZE: 180,

  // Audio format
  SAMPLE_RATE: 44100,
  CHANNELS: 2,
  BITS_PER_SAMPLE: 16,

  // Buffer sizes
  RING_BUFFER_SIZE: 256 * 1024,
  PREBUFFER_SIZE: 8 * 1024,
} as const;

export interface UsbAudioCaptureOptions {
  onData: (data: Buffer) => void;
  onError?: (error: Error) => void;
}

/**
 * Audio capture using PipeWire or ALSA
 */
export class UsbAudioCapture {
  private process: ChildProcess | null = null;
  private running = false;
  private readonly onData: (data: Buffer) => void;
  private readonly onError: (error: Error) => void;

  constructor(options: UsbAudioCaptureOptions) {
    this.onData = options.onData;
    this.onError = options.onError ?? ((err) => console.error("Audio error:", err));
  }

  /**
   * Find M8 audio device in PipeWire
   */
  private async findM8Target(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn("pw-cli", ["list-objects"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";

      proc.stdout?.on("data", (data) => { output += data.toString(); });
      proc.on("close", () => {
        // Look for M8 input node
        const match = output.match(/node\.name\s*=\s*"(alsa_input\.usb-DirtyWave_M8[^"]+)"/);
        resolve(match ? match[1] : null);
      });
      proc.on("error", () => resolve(null));
    });
  }

  /**
   * Find M8 ALSA device
   */
  private async findM8Alsa(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn("arecord", ["-l"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";

      proc.stdout?.on("data", (data) => { output += data.toString(); });
      proc.on("close", () => {
        // Look for M8 card
        const match = output.match(/card (\d+):.*M8/);
        resolve(match ? `hw:${match[1]}` : null);
      });
      proc.on("error", () => resolve(null));
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Start audio capture
   */
  async start(): Promise<void> {
    if (this.running) return;

    // Try PipeWire first
    const pwTarget = await this.findM8Target();
    if (pwTarget) {
      console.log(`Using PipeWire target: ${pwTarget}`);
      this.startPwRecord(pwTarget);
      return;
    }

    // Fallback to ALSA
    const alsaDevice = await this.findM8Alsa();
    if (alsaDevice) {
      console.log(`Using ALSA device: ${alsaDevice}`);
      this.startArecord(alsaDevice);
      return;
    }

    throw new Error("M8 audio device not found");
  }

  /**
   * Start pw-record (PipeWire)
   */
  private startPwRecord(target: string): void {
    this.process = spawn("pw-record", [
      "--target", target,
      "--rate", String(USB_AUDIO_CONSTANTS.SAMPLE_RATE),
      "--channels", String(USB_AUDIO_CONSTANTS.CHANNELS),
      "--format", "s16",
      "-",  // stdout
    ]);

    this.setupProcess();
  }

  /**
   * Start arecord (ALSA)
   */
  private startArecord(device: string): void {
    this.process = spawn("arecord", [
      "-D", device,
      "-f", "S16_LE",
      "-r", String(USB_AUDIO_CONSTANTS.SAMPLE_RATE),
      "-c", String(USB_AUDIO_CONSTANTS.CHANNELS),
      "-t", "raw",
      "-q",
      "-",
    ]);

    this.setupProcess();
  }

  /**
   * Setup process handlers
   */
  private setupProcess(): void {
    if (!this.process) return;

    this.running = true;

    this.process.stdout?.on("data", (data: Buffer) => {
      this.onData(data);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes("Recording")) {
        console.error("Audio stderr:", msg);
      }
    });

    this.process.on("error", (err) => {
      this.onError(err);
      this.running = false;
    });

    this.process.on("close", (code) => {
      if (code !== 0 && code !== null) {
        this.onError(new Error(`Audio process exited with code ${code}`));
      }
      this.running = false;
      this.process = null;
    });
  }

  /**
   * Stop audio capture
   */
  async stop(): Promise<void> {
    if (!this.running || !this.process) return;

    this.running = false;
    this.process.kill("SIGTERM");

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      if (this.process) {
        this.process.on("close", () => resolve());
        setTimeout(resolve, 1000);
      } else {
        resolve();
      }
    });

    this.process = null;
  }

  /**
   * Test helper - simulate receiving data
   * @internal
   */
  _testOnData(data: Buffer): void {
    this.onData(data);
  }
}
