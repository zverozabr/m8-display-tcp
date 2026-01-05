/**
 * UsbAudioStreamer - Complete USB audio streaming solution
 * Combines UsbAudioCapture + AudioHub for multi-client streaming
 * Replaces the old arecord-based AudioStreamer
 */

import type { WebSocket } from "ws";
import {
  AUDIO_CONSTANTS,
  type IAudioCapture,
} from "./native-capture";
import { AlsaCapture } from "./alsa-capture";
import { AudioHub } from "./audio-hub";

export interface UsbAudioStreamerOptions {
  autoStart?: boolean;
  onAudioData?: (data: Buffer) => void; // External callback (e.g., TCP streaming)
}

/**
 * USB Audio Streamer
 * - Captures audio directly from M8 USB (bypasses ALSA/PipeWire)
 * - Distributes to multiple WebSocket clients
 * - Supports file recording simultaneously
 */
export class UsbAudioStreamer {
  private capture: IAudioCapture;
  private hub: AudioHub;
  private running = false;
  private startPromise: Promise<void> | null = null;
  private autoStart: boolean;
  private externalCallback: ((data: Buffer) => void) | null;

  constructor(options: UsbAudioStreamerOptions = {}) {
    this.autoStart = options.autoStart ?? false;
    this.externalCallback = options.onAudioData ?? null;

    console.log(`[UsbStreamer] External callback: ${options.onAudioData ? "SET" : "NOT SET"}`);

    this.hub = new AudioHub(AUDIO_CONSTANTS.RING_BUFFER_SIZE);

    // Use ALSA capture via arecord (doesn't need root)
    this.capture = new AlsaCapture({
      onData: (data) => {
        this.hub.onAudioData(data);
        // Also send to external callback (TCP)
        if (this.externalCallback) {
          this.externalCallback(data);
        }
      },
      onError: (err) => {
        console.error("USB Audio capture error:", err.message);
        this.hub.broadcastError(err.message);
      },
    });

    // Auto-start if requested
    if (this.autoStart) {
      this.start().catch((err) => {
        console.error("Failed to auto-start USB audio:", err);
      });
    }
  }

  /**
   * Add WebSocket client for audio streaming
   */
  addClient(ws: WebSocket): void {
    this.hub.addClient(ws);
    console.log(`Audio client added, total: ${this.hub.clientCount}`);

    // Start capture on first client
    if (this.hub.clientCount === 1 && !this.running) {
      this.start().catch((err) => {
        console.error("Failed to start audio capture:", err);
        this.hub.broadcastError(err.message);
      });
    }

    ws.on("close", () => {
      console.log(`Audio client removed, total: ${this.hub.clientCount}`);

      // Stop capture if no clients (optional - can also keep running)
      // For now, keep running once started to avoid device open/close overhead
    });
  }

  /**
   * Start USB audio capture
   */
  async start(): Promise<void> {
    if (this.running) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = (async () => {
      try {
        console.log("Starting USB audio capture...");
        await this.capture.start();
        this.running = true;
        console.log("USB audio capture started successfully");
      } catch (err) {
        console.error("USB audio capture failed:", err);
        throw err;
      } finally {
        this.startPromise = null;
      }
    })();

    return this.startPromise;
  }

  /**
   * Stop USB audio capture
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    console.log("Stopping USB audio capture...");
    await this.capture.stop();
    await this.hub.stopRecording();
    this.running = false;
    console.log("USB audio capture stopped");
  }

  /**
   * Restart audio capture (e.g. after USB reconnect)
   */
  async restart(): Promise<void> {
    console.log("Restarting USB audio capture...");
    await this.stop();

    // Wait for device to re-enumerate
    await new Promise((r) => setTimeout(r, 1500));

    if (this.hub.clientCount > 0) {
      await this.start();
    }
  }

  /**
   * Start recording to file
   */
  async startRecording(filePath: string): Promise<void> {
    await this.hub.startRecording(filePath);
    console.log(`Recording started: ${filePath}`);
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    await this.hub.stopRecording();
    console.log("Recording stopped");
  }

  /**
   * Is currently streaming
   */
  isStreaming(): boolean {
    return this.running;
  }

  /**
   * Is currently recording
   */
  isRecording(): boolean {
    return this.hub.isRecording;
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.hub.clientCount;
  }

  /**
   * Get buffer statistics
   */
  getBufferStats(): { length: number; capacity: number; available: number } {
    return this.hub.getBufferStats();
  }
}
