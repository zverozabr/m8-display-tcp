/**
 * AudioHub - Multi-client audio distribution
 * Receives PCM from USB capture, broadcasts to WebSocket clients + optional file recording
 * SOLID: Single responsibility - distribution only
 */

import type { WebSocket } from "ws";
import { RingBuffer } from "./ring-buffer";
import { createWriteStream, type WriteStream } from "fs";

// Message type prefixes for WebSocket framing
const MSG_AUDIO = 0x00;
const MSG_CONTROL = 0x01;

export class AudioHub {
  private clients: Set<WebSocket> = new Set();
  private ringBuffer: RingBuffer;
  private fileStream: WriteStream | null = null;
  private recording = false;
  private audioPacketCount = 0;
  private lastLogTime = 0;

  constructor(bufferSize = 256 * 1024) {
    this.ringBuffer = new RingBuffer(bufferSize, { allowOverwrite: true });
  }

  /**
   * Add WebSocket client
   */
  addClient(ws: WebSocket): void {
    this.clients.add(ws);

    ws.on("close", () => {
      this.clients.delete(ws);
    });

    ws.on("error", () => {
      this.clients.delete(ws);
    });
  }

  /**
   * Remove WebSocket client
   */
  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Current client count
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Is currently recording to file
   */
  get isRecording(): boolean {
    return this.recording;
  }

  /**
   * Handle incoming audio data from USB capture
   * Broadcasts to all clients + writes to file if recording
   */
  onAudioData(data: Buffer): void {
    // Store in ring buffer (for potential late joiners/catchup)
    this.ringBuffer.push(new Uint8Array(data));

    // Frame: [0x00] + PCM data
    const framed = Buffer.concat([Buffer.from([MSG_AUDIO]), data]);

    // Log audio broadcast stats every 5 seconds
    this.audioPacketCount++;
    const now = Date.now();
    if (now - this.lastLogTime > 5000 && this.clients.size > 0) {
      console.log(`Audio broadcast: ${this.audioPacketCount} packets, ${data.length} bytes/pkt, ${this.clients.size} clients`);
      this.audioPacketCount = 0;
      this.lastLogTime = now;
    }

    // Broadcast to all connected clients
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

    // Remove dead clients
    for (const client of dead) {
      this.clients.delete(client);
    }

    // Write to file if recording
    if (this.recording && this.fileStream) {
      this.fileStream.write(data);
    }
  }

  /**
   * Broadcast error/control message to all clients
   */
  broadcastError(message: string): void {
    const json = Buffer.from(JSON.stringify({ error: message }));
    const payload = Buffer.concat([Buffer.from([MSG_CONTROL]), json]);

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  /**
   * Broadcast control message
   */
  broadcastControl(data: object): void {
    const json = Buffer.from(JSON.stringify(data));
    const payload = Buffer.concat([Buffer.from([MSG_CONTROL]), json]);

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  /**
   * Start recording to file
   */
  async startRecording(filePath: string): Promise<void> {
    if (this.recording) {
      await this.stopRecording();
    }

    this.fileStream = createWriteStream(filePath);
    this.recording = true;
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    if (!this.recording) return;

    this.recording = false;

    if (this.fileStream) {
      await new Promise<void>((resolve, reject) => {
        this.fileStream!.end((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.fileStream = null;
    }
  }

  /**
   * Clear ring buffer
   */
  clearBuffer(): void {
    this.ringBuffer.clear();
  }

  /**
   * Get buffer statistics
   */
  getBufferStats(): { length: number; capacity: number; available: number } {
    return {
      length: this.ringBuffer.length,
      capacity: this.ringBuffer.capacity,
      available: this.ringBuffer.available,
    };
  }
}
