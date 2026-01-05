/**
 * TCP Serial Proxy
 * Bidirectional proxy for remote m8c access
 *
 * Architecture:
 *   M8 Teensy <-> m8-display <-> TCP:3333 <-> remote m8c
 *
 * Features:
 * - Raw bidirectional data passthrough
 * - Multiple client support (broadcast FROM M8)
 * - Merged input TO M8 from all clients
 */

import { type Socket, type Server } from "net";
import * as net from "net";

export type RawDataCallback = (data: Uint8Array) => void;

// Packet headers (all packets: header + 2-byte length BE + data)
const DISPLAY_HEADER = 0x44; // 'D' - display/SLIP data
const AUDIO_HEADER = 0x41;   // 'A' - audio PCM data

export interface TcpProxyOptions {
  port: number;
  onClientData?: RawDataCallback; // Data from TCP clients -> M8
  onConnect?: (clientId: string) => void;
  onDisconnect?: (clientId: string) => void;
  enableAudio?: boolean; // Enable audio streaming to clients
}

interface ClientInfo {
  id: string;
  socket: Socket;
  address: string;
}

/**
 * TCP Serial Proxy Server
 */
export class TcpProxy {
  private server: Server | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private options: Required<TcpProxyOptions>;
  private running = false;
  private audioEnabled = false;

  constructor(options: TcpProxyOptions) {
    this.options = {
      port: options.port,
      onClientData: options.onClientData ?? (() => {}),
      onConnect: options.onConnect ?? (() => {}),
      onDisconnect: options.onDisconnect ?? (() => {}),
      enableAudio: options.enableAudio ?? true,
    };
    this.audioEnabled = this.options.enableAudio;
  }

  /**
   * Start TCP server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on("error", (err) => {
        console.error("TCP Proxy error:", err);
        reject(err);
      });

      this.server.listen(this.options.port, () => {
        this.running = true;
        console.log(`TCP Proxy listening on port ${this.options.port}`);
        resolve();
      });
    });
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: Socket): void {
    const clientId = crypto.randomUUID();
    const address = `${socket.remoteAddress}:${socket.remotePort}`;

    const client: ClientInfo = {
      id: clientId,
      socket,
      address,
    };

    this.clients.set(clientId, client);
    console.log(`TCP client connected: ${address} (${clientId})`);
    this.options.onConnect(clientId);

    // Handle data from client -> M8
    socket.on("data", (data: Buffer) => {
      this.options.onClientData(new Uint8Array(data));
    });

    // Handle client disconnect
    socket.on("close", () => {
      this.clients.delete(clientId);
      console.log(`TCP client disconnected: ${address}`);
      this.options.onDisconnect(clientId);
    });

    socket.on("error", (err) => {
      console.error(`TCP client error (${address}):`, err.message);
      this.clients.delete(clientId);
    });

    // Set socket options for low latency
    socket.setNoDelay(true);
  }

  /**
   * Send data to all connected clients (M8 -> clients)
   * Format: 'D' + 2-byte length (BE) + SLIP data
   */
  private displayPacketCount = 0;
  private displayLastLog = 0;

  broadcast(data: Uint8Array): void {
    if (this.clients.size === 0) return;

    // Log display broadcast stats every 5 seconds
    this.displayPacketCount++;
    const now = Date.now();
    if (now - this.displayLastLog > 5000) {
      // Log first packet's header for debugging
      const header = Buffer.allocUnsafe(3);
      header[0] = DISPLAY_HEADER;  // Should be 0x44 = 'D'
      header.writeUInt16BE(data.length, 1);
      console.log(`[TcpProxy] Display: ${this.displayPacketCount} pkts, ${data.length} bytes/pkt, ${this.clients.size} clients, header: ${header[0].toString(16)} ${header[1].toString(16)} ${header[2].toString(16)}`);
      this.displayPacketCount = 0;
      this.displayLastLog = now;
    }

    // Create packet: 'D' + length (2 bytes BE) + data
    const packet = Buffer.allocUnsafe(3 + data.length);
    packet[0] = DISPLAY_HEADER;
    packet.writeUInt16BE(data.length, 1);
    Buffer.from(data).copy(packet, 3);

    for (const client of this.clients.values()) {
      try {
        client.socket.write(packet);
      } catch (err) {
        console.error(`Error sending to ${client.address}:`, err);
      }
    }
  }

  /**
   * Send audio data to all connected clients
   * Format: 'A' + 2-byte length (BE) + PCM data
   */
  private audioPacketCount = 0;
  private audioLastLog = 0;

  broadcastAudio(pcmData: Buffer): void {
    if (!this.audioEnabled || this.clients.size === 0) return;

    // Create packet: 'A' + length (2 bytes BE) + data
    const packet = Buffer.allocUnsafe(3 + pcmData.length);
    packet[0] = AUDIO_HEADER;
    packet.writeUInt16BE(pcmData.length, 1);
    pcmData.copy(packet, 3);

    // Log audio broadcast stats every 5 seconds
    this.audioPacketCount++;
    const now = Date.now();
    if (now - this.audioLastLog > 5000) {
      console.log(`[TcpProxy] Audio: ${this.audioPacketCount} pkts, ${pcmData.length} bytes/pkt, ${this.clients.size} clients`);
      this.audioPacketCount = 0;
      this.audioLastLog = now;
    }

    for (const client of this.clients.values()) {
      try {
        client.socket.write(packet);
      } catch (err) {
        // Ignore write errors for audio (non-critical)
      }
    }
  }

  /**
   * Check if audio streaming is enabled
   */
  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  /**
   * Send data to specific client
   */
  sendTo(clientId: string, data: Uint8Array): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.write(Buffer.from(data));
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get client info
   */
  getClients(): { id: string; address: string }[] {
    return Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      address: c.address,
    }));
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Stop server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.destroy();
      }
      this.clients.clear();

      // Close server
      this.server.close(() => {
        this.running = false;
        console.log("TCP Proxy stopped");
        resolve();
      });
    });
  }
}
