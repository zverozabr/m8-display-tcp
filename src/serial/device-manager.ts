/**
 * Device Manager
 * Dynamic device selection and reconnection for M8 Tracker
 *
 * Allows non-programmers to select and switch M8 devices
 * without restarting the server or Docker container.
 */

import { SerialPort } from "serialport";
import type { M8Connection } from "./connection";

/**
 * Serial port information
 */
export interface PortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  isM8: boolean;
}

/**
 * Current port status
 */
export interface PortStatus {
  port: string;
  connected: boolean;
}

/**
 * Function to list serial ports (injectable for testing)
 */
export type ListPortsFn = () => Promise<PortInfo[]>;

/**
 * Default port listing using serialport library
 * Filters to only show real USB devices (ttyACM*, ttyUSB*)
 */
export async function defaultListPorts(): Promise<PortInfo[]> {
  const ports = await SerialPort.list();
  return ports
    .filter((p) => /ttyACM|ttyUSB/.test(p.path))
    .map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      vendorId: p.vendorId,
      productId: p.productId,
      isM8:
        p.vendorId === "16c0" &&
        (p.productId === "048a" || p.productId === "048b"),
    }));
}

/**
 * DeviceManager - handles device discovery and switching
 *
 * Usage:
 * ```typescript
 * const manager = new DeviceManager(connection);
 *
 * // List available ports
 * const ports = await manager.listPorts();
 *
 * // Switch to different port
 * await manager.setPort('/dev/ttyACM1');
 *
 * // Force reconnect
 * await manager.reconnect();
 * ```
 */
export class DeviceManager {
  private connection: M8Connection;
  private listPortsFn: ListPortsFn;

  constructor(connection: M8Connection, listPortsFn?: ListPortsFn) {
    this.connection = connection;
    this.listPortsFn = listPortsFn ?? defaultListPorts;
  }

  /**
   * List all available serial ports
   */
  async listPorts(): Promise<PortInfo[]> {
    return this.listPortsFn();
  }

  /**
   * Get current port and connection status
   */
  getCurrentPort(): PortStatus {
    return {
      port: this.connection.getPort(),
      connected: this.connection.isConnected(),
    };
  }

  /**
   * Switch to a different serial port
   * @param port - Path to serial port (e.g., '/dev/ttyACM1')
   * @throws Error if port doesn't exist
   */
  async setPort(port: string): Promise<void> {
    // 1. Validate port exists
    const ports = await this.listPorts();
    if (!ports.find((p) => p.path === port)) {
      throw new Error(`Port ${port} not found`);
    }

    // 2. Temporarily disable auto-reconnect to prevent interference
    const wasAutoReconnect = this.connection.getAutoReconnect?.() ?? true;
    this.connection.setAutoReconnect?.(false);

    try {
      // 3. Disconnect from current port
      await this.connection.disconnect();

      // 4. Update port
      this.connection.setPort(port);

      // 5. Connect to new port
      await this.connection.connect();
    } finally {
      // 6. Restore auto-reconnect setting
      this.connection.setAutoReconnect?.(wasAutoReconnect);
    }
  }

  /**
   * Force reconnection to current port
   */
  async reconnect(): Promise<void> {
    const currentPort = this.connection.getPort();

    // Temporarily disable auto-reconnect
    const wasAutoReconnect = this.connection.getAutoReconnect?.() ?? true;
    this.connection.setAutoReconnect?.(false);

    try {
      await this.connection.disconnect();
      await this.connection.connect();
    } finally {
      this.connection.setAutoReconnect?.(wasAutoReconnect);
    }
  }

  /**
   * Find first M8 device
   * @returns Port path or null if not found
   */
  async findM8Device(): Promise<string | null> {
    const ports = await this.listPorts();
    const m8Port = ports.find((p) => p.isM8);
    return m8Port?.path ?? null;
  }

  /**
   * Auto-connect to M8 device if not already connected
   */
  async autoConnect(): Promise<void> {
    if (this.connection.isConnected()) {
      return;
    }

    const m8Port = await this.findM8Device();
    if (m8Port) {
      this.connection.setPort(m8Port);
      await this.connection.connect();
    }
  }
}
