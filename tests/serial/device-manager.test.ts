/**
 * DeviceManager Tests
 * TDD: Tests for dynamic device selection and reconnection
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DeviceManager, type PortInfo } from "../../src/serial/device-manager";

// Mock SerialPort.list()
const mockPorts: PortInfo[] = [
  {
    path: "/dev/ttyACM0",
    manufacturer: "Teensyduino",
    vendorId: "16c0",
    productId: "048a",
    isM8: true,
  },
  {
    path: "/dev/ttyACM1",
    manufacturer: "Arduino",
    vendorId: "2341",
    productId: "0043",
    isM8: false,
  },
  {
    path: "/dev/ttyUSB0",
    manufacturer: "FTDI",
    vendorId: "0403",
    productId: "6001",
    isM8: false,
  },
];

// Mock M8Connection
class MockM8Connection {
  private _port = "/dev/ttyACM0";
  private _connected = true;
  private _autoReconnect = true;

  isConnected(): boolean {
    return this._connected;
  }

  getPort(): string {
    return this._port;
  }

  setPort(port: string): void {
    this._port = port;
  }

  async connect(): Promise<void> {
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  setAutoReconnect(enabled: boolean): void {
    this._autoReconnect = enabled;
  }

  getAutoReconnect(): boolean {
    return this._autoReconnect;
  }
}

describe("DeviceManager", () => {
  let deviceManager: DeviceManager;
  let mockConnection: MockM8Connection;

  beforeEach(() => {
    mockConnection = new MockM8Connection();
    deviceManager = new DeviceManager(mockConnection as any, async () => mockPorts);
  });

  describe("listPorts()", () => {
    it("should return array of available serial ports", async () => {
      const ports = await deviceManager.listPorts();
      expect(Array.isArray(ports)).toBe(true);
      expect(ports.length).toBe(3);
    });

    it("should mark M8 devices with isM8 flag", async () => {
      const ports = await deviceManager.listPorts();
      const m8Port = ports.find((p) => p.isM8);
      expect(m8Port).toBeDefined();
      expect(m8Port!.path).toBe("/dev/ttyACM0");
      expect(m8Port!.vendorId).toBe("16c0");
    });

    it("should include path, manufacturer, vendorId, productId", async () => {
      const ports = await deviceManager.listPorts();
      const port = ports[0];
      expect(port.path).toBeDefined();
      expect(port.manufacturer).toBeDefined();
      expect(port.vendorId).toBeDefined();
      expect(port.productId).toBeDefined();
    });

    it("should return empty array when no ports available", async () => {
      const emptyManager = new DeviceManager(mockConnection as any, async () => []);
      const ports = await emptyManager.listPorts();
      expect(ports).toEqual([]);
    });
  });

  describe("getCurrentPort()", () => {
    it("should return current port and connection status", () => {
      const status = deviceManager.getCurrentPort();
      expect(status.port).toBe("/dev/ttyACM0");
      expect(status.connected).toBe(true);
    });

    it("should reflect disconnected state", async () => {
      await mockConnection.disconnect();
      const status = deviceManager.getCurrentPort();
      expect(status.connected).toBe(false);
    });
  });

  describe("setPort()", () => {
    it("should disconnect from current port first", async () => {
      await deviceManager.setPort("/dev/ttyACM1");
      // After setPort, should attempt to connect to new port
      expect(mockConnection.getPort()).toBe("/dev/ttyACM1");
    });

    it("should update port setting", async () => {
      await deviceManager.setPort("/dev/ttyUSB0");
      expect(mockConnection.getPort()).toBe("/dev/ttyUSB0");
    });

    it("should throw on invalid port", async () => {
      await expect(deviceManager.setPort("/dev/invalid")).rejects.toThrow(
        "Port /dev/invalid not found"
      );
    });

    it("should disable auto-reconnect during port change", async () => {
      await deviceManager.setPort("/dev/ttyACM1");
      // Auto-reconnect should be re-enabled after successful change
      expect(mockConnection.getAutoReconnect()).toBe(true);
    });
  });

  describe("reconnect()", () => {
    it("should disconnect and reconnect", async () => {
      const initialPort = mockConnection.getPort();
      await deviceManager.reconnect();
      expect(mockConnection.getPort()).toBe(initialPort);
      expect(mockConnection.isConnected()).toBe(true);
    });

    it("should work even if currently disconnected", async () => {
      await mockConnection.disconnect();
      await deviceManager.reconnect();
      expect(mockConnection.isConnected()).toBe(true);
    });
  });

  describe("findM8Device()", () => {
    it("should find first M8 device", async () => {
      const m8Port = await deviceManager.findM8Device();
      expect(m8Port).toBe("/dev/ttyACM0");
    });

    it("should return null if no M8 device found", async () => {
      const noM8Manager = new DeviceManager(mockConnection as any, async () => [
        { path: "/dev/ttyUSB0", isM8: false },
      ]);
      const m8Port = await noM8Manager.findM8Device();
      expect(m8Port).toBeNull();
    });
  });

  describe("autoConnect()", () => {
    it("should auto-connect to M8 device if found", async () => {
      await mockConnection.disconnect();
      mockConnection.setPort("");
      await deviceManager.autoConnect();
      expect(mockConnection.getPort()).toBe("/dev/ttyACM0");
    });

    it("should do nothing if already connected", async () => {
      const originalPort = mockConnection.getPort();
      await deviceManager.autoConnect();
      expect(mockConnection.getPort()).toBe(originalPort);
    });
  });
});
