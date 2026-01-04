/**
 * M8 Serial Connection
 * Manages serial port communication with M8 Tracker
 */

import { SerialPort } from "serialport";
import { SlipDecoder } from "./slip";
import { parseCommand } from "./commands";
import type { ParsedCommand } from "../state/types";
import { resetM8Usb } from "../usb/reset";

export type CommandCallback = (cmd: ParsedCommand) => void;
export type RawCallback = (data: Uint8Array) => void;
export type ErrorCallback = (error: Error) => void;

export interface M8ConnectionOptions {
  port?: string;                 // Auto-detect if not specified
  baudRate?: number;
  onCommand?: CommandCallback;
  onRaw?: RawCallback;          // Decoded SLIP frames
  onSerialData?: RawCallback;   // Raw serial bytes (for TCP proxy)
  onError?: ErrorCallback;
  onConnect?: () => void;
  onDisconnect?: () => void;
  autoReconnect?: boolean;       // Auto-reconnect on disconnect (default: true)
  reconnectInterval?: number;    // Reconnect scan interval in ms (default: 1000)
}

/**
 * M8 Serial Connection
 * Handles SLIP decoding and command parsing with auto-reconnect
 */
export class M8Connection {
  private serial: SerialPort | null = null;
  private slip: SlipDecoder;
  private options: {
    port: string;
    baudRate: number;
    onCommand: CommandCallback;
    onRaw: RawCallback;
    onSerialData: RawCallback;
    onError: ErrorCallback;
    onConnect: () => void;
    onDisconnect: () => void;
    autoReconnect: boolean;
    reconnectInterval: number;
  };
  private connected = false;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private reconnectAttempts = 0;
  private static readonly MAX_SOFT_ATTEMPTS = 3;

  constructor(options: M8ConnectionOptions) {
    this.options = {
      port: options.port ?? "",
      baudRate: options.baudRate ?? 115200,
      onCommand: options.onCommand ?? (() => {}),
      onRaw: options.onRaw ?? (() => {}),
      onSerialData: options.onSerialData ?? (() => {}),
      onError: options.onError ?? console.error,
      onConnect: options.onConnect ?? (() => {}),
      onDisconnect: options.onDisconnect ?? (() => {}),
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 1000,
    };

    this.slip = new SlipDecoder((frame) => this.handleFrame(frame));
  }

  private handleFrame(frame: Uint8Array): void {
    // Forward raw frame
    this.options.onRaw(frame);

    // Parse command
    const cmd = parseCommand(frame);
    if (cmd) {
      this.options.onCommand(cmd);
    }
  }

  /**
   * Connect to M8 (with auto-detection if port not specified)
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.stopping = false;

    // Auto-detect port if not specified
    let port = this.options.port;
    if (!port) {
      port = await findM8Device() ?? "";
      if (!port) {
        throw new Error("M8 device not found");
      }
      this.options.port = port;
    }

    return new Promise((resolve, reject) => {
      this.serial = new SerialPort(
        {
          path: port,
          baudRate: this.options.baudRate,
          dataBits: 8,
          parity: "none",
          stopBits: 1,
          rtscts: false,  // No flow control
          xon: false,
          xoff: false,
          xany: false,
        },
        (err) => {
          if (err) {
            this.options.onError(err);
            // Start reconnect loop if auto-reconnect enabled
            if (this.options.autoReconnect && !this.stopping) {
              this.startReconnectLoop();
            }
            reject(err);
            return;
          }

          this.connected = true;
          this.stopReconnectLoop();
          this.setupListeners();
          this.options.onConnect();
          resolve();
        }
      );
    });
  }

  /**
   * Start auto-reconnect loop
   */
  private startReconnectLoop(): void {
    if (this.reconnectTimer) return;

    console.log("Starting M8 auto-reconnect...");
    this.reconnectAttempts = 0;

    this.reconnectTimer = setInterval(async () => {
      if (this.connected || this.stopping) {
        this.stopReconnectLoop();
        return;
      }

      this.reconnectAttempts++;

      // After MAX_SOFT_ATTEMPTS failed tries, do USB power cycle
      if (this.reconnectAttempts >= M8Connection.MAX_SOFT_ATTEMPTS) {
        console.log(`Soft reconnect failed ${this.reconnectAttempts} times, trying USB power cycle...`);
        const resetOk = await resetM8Usb(500);
        if (resetOk) {
          this.reconnectAttempts = 0; // Reset counter after power cycle
        }
        return; // Wait for next interval after USB reset
      }

      try {
        // Scan for M8 device
        const port = await findM8Device();
        if (port) {
          console.log(`Found M8 at ${port}, reconnecting...`);
          this.options.port = port;
          await this.connect();
          this.reconnectAttempts = 0; // Reset on successful connect
        }
      } catch {
        // Still not available, keep trying
      }
    }, this.options.reconnectInterval);
  }

  /**
   * Stop auto-reconnect loop
   */
  private stopReconnectLoop(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setupListeners(): void {
    if (!this.serial) return;

    this.serial.on("data", (data: Buffer) => {
      const bytes = new Uint8Array(data);
      // Forward raw serial data for TCP proxy
      this.options.onSerialData(bytes);
      // Feed to SLIP decoder
      this.slip.feed(bytes);
    });

    this.serial.on("error", (err) => {
      this.options.onError(err);
      this.handleDisconnect();
    });

    this.serial.on("close", () => {
      this.handleDisconnect();
    });
  }

  private handleDisconnect(): void {
    if (!this.connected) return;

    this.connected = false;
    this.serial = null;
    this.options.port = ""; // Clear port for re-detection
    this.options.onDisconnect();

    // Start auto-reconnect if enabled
    if (this.options.autoReconnect && !this.stopping) {
      this.startReconnectLoop();
    }
  }

  /**
   * Disconnect from M8 (stops auto-reconnect)
   */
  async disconnect(): Promise<void> {
    this.stopping = true;
    this.stopReconnectLoop();

    if (!this.serial || !this.connected) {
      return;
    }

    // Send disconnect command
    try {
      await this.sendRaw(new Uint8Array([0x44])); // 'D'
    } catch { /* ignore */ }

    return new Promise((resolve) => {
      this.serial!.close(() => {
        this.connected = false;
        this.serial = null;
        resolve();
      });
    });
  }

  /**
   * Send raw bytes to M8
   */
  async sendRaw(data: Uint8Array): Promise<void> {
    if (!this.serial || !this.connected) {
      throw new Error("Not connected");
    }

    return new Promise((resolve, reject) => {
      this.serial!.write(Buffer.from(data), (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Drain to ensure data is sent
        this.serial!.drain((drainErr) => {
          if (drainErr) {
            reject(drainErr);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Send key state to M8
   * @param bitmask Button bitmask (see M8Key in types.ts)
   */
  async sendKeys(bitmask: number): Promise<void> {
    await this.sendRaw(new Uint8Array([0x43, bitmask])); // 'C' + bitmask
  }

  /**
   * Send note on to M8
   */
  async sendNoteOn(note: number, velocity: number): Promise<void> {
    await this.sendRaw(new Uint8Array([0x4b, note, velocity])); // 'K' + note + vel
  }

  /**
   * Send note off to M8
   */
  async sendNoteOff(): Promise<void> {
    await this.sendRaw(new Uint8Array([0x4b, 0xff])); // 'K' + 0xFF
  }

  /**
   * Reset M8 display
   */
  async reset(): Promise<void> {
    await this.sendRaw(new Uint8Array([0x52])); // 'R'
  }

  /**
   * Enable M8 display
   * Must send 'E' first, wait 500ms, then 'R' (as in m8c)
   */
  async enable(): Promise<void> {
    await this.sendRaw(new Uint8Array([0x45])); // 'E'
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.sendRaw(new Uint8Array([0x52])); // 'R'
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get serial port path
   */
  getPort(): string {
    return this.options.port;
  }
}

/**
 * Find M8 device
 * Returns port path if found, null otherwise
 */
export async function findM8Device(): Promise<string | null> {
  const ports = await SerialPort.list();

  for (const port of ports) {
    // M8 Teensy VID:PID = 16c0:048a or 16c0:048b
    if (port.vendorId === "16c0" && (port.productId === "048a" || port.productId === "048b")) {
      return port.path;
    }
  }

  return null;
}

/**
 * List all serial ports
 */
export async function listPorts(): Promise<
  { path: string; manufacturer?: string; vendorId?: string; productId?: string }[]
> {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer,
    vendorId: p.vendorId,
    productId: p.productId,
  }));
}
