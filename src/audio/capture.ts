/**
 * M8 Audio Capture
 * Records audio from M8 USB audio device
 */

import { spawn, type ChildProcess } from "child_process";
import { writeFile, unlink, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export interface AudioCaptureOptions {
  device?: string; // ALSA device (default: hw:M8)
  sampleRate?: number; // Sample rate (default: 44100)
  channels?: number; // Channels (default: 2)
  format?: string; // Format (default: S16_LE)
}

export interface RecordingResult {
  path: string;
  duration: number;
  size: number;
}

/**
 * Find M8 audio device (with 5s timeout)
 */
export async function findM8AudioDevice(): Promise<string | null> {
  const TIMEOUT_MS = 5000;

  return new Promise((resolve) => {
    const proc = spawn("arecord", ["-l"]);
    let output = "";
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill("SIGKILL");
        resolve(null);
      }
    }, TIMEOUT_MS);

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      // Look for M8 or Teensy in the output
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.includes("M8") || line.includes("Teensy")) {
          // Extract card number (supports English "card" and Russian "карта")
          const match = line.match(/(?:card|карта)\s+(\d+)/i);
          if (match) {
            resolve(`hw:${match[1]}`);
            return;
          }
        }
      }
      resolve(null);
    });

    proc.on("error", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(null);
      }
    });
  });
}

/**
 * Audio Recorder class
 */
export class AudioRecorder {
  private options: Required<AudioCaptureOptions>;
  private process: ChildProcess | null = null;
  private outputPath: string | null = null;
  private startTime: number = 0;

  constructor(options: AudioCaptureOptions = {}) {
    this.options = {
      device: options.device ?? "hw:M8",
      sampleRate: options.sampleRate ?? 44100,
      channels: options.channels ?? 2,
      format: options.format ?? "S16_LE",
    };
  }

  /**
   * Check if recording
   */
  isRecording(): boolean {
    return this.process !== null;
  }

  /**
   * Start recording
   */
  async start(): Promise<string> {
    if (this.process) {
      throw new Error("Already recording");
    }

    // Create temp file
    const tempDir = join(tmpdir(), "m8-display");
    await mkdir(tempDir, { recursive: true });
    this.outputPath = join(tempDir, `recording_${Date.now()}.wav`);

    // Start arecord
    this.process = spawn("arecord", [
      "-D", this.options.device,
      "-f", this.options.format,
      "-r", String(this.options.sampleRate),
      "-c", String(this.options.channels),
      "-t", "wav",
      this.outputPath,
    ]);

    this.startTime = Date.now();

    this.process.on("error", (err) => {
      console.error("Audio recording error:", err);
      this.process = null;
    });

    return this.outputPath;
  }

  /**
   * Stop recording and return result
   */
  async stop(): Promise<RecordingResult> {
    if (!this.process || !this.outputPath) {
      throw new Error("Not recording");
    }

    const duration = (Date.now() - this.startTime) / 1000;

    return new Promise((resolve, reject) => {
      const proc = this.process!;
      const path = this.outputPath!;

      proc.on("close", async () => {
        this.process = null;

        try {
          const stats = await readFile(path);
          resolve({
            path,
            duration,
            size: stats.length,
          });
        } catch (err) {
          reject(err);
        }
      });

      // Send SIGINT to stop recording gracefully
      proc.kill("SIGINT");
    });
  }

  /**
   * Record for specified duration
   */
  async record(durationSeconds: number): Promise<RecordingResult> {
    await this.start();

    await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000));

    return this.stop();
  }
}

/**
 * Quick record function
 */
export async function recordAudio(
  durationSeconds: number,
  options?: AudioCaptureOptions
): Promise<RecordingResult> {
  const recorder = new AudioRecorder(options);
  return recorder.record(durationSeconds);
}

/**
 * Get audio device info
 */
export async function getAudioDevices(): Promise<string[]> {
  return new Promise((resolve) => {
    const proc = spawn("arecord", ["-l"]);
    let output = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      const devices: string[] = [];
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.startsWith("card")) {
          devices.push(line);
        }
      }
      resolve(devices);
    });

    proc.on("error", () => resolve([]));
  });
}
