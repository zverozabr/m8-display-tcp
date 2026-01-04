/**
 * Screen Command Tests
 * Tests for M8 command broadcasting to /screen clients
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { ParsedCommand, RectCommand, TextCommand, WaveCommand, SystemCommand } from "../src/state/types";

// Mock WebSocket
interface MockWebSocket {
  readyState: number;
  OPEN: number;
  sentMessages: string[];
  send(data: string | Uint8Array): void;
}

function createMockWs(): MockWebSocket {
  return {
    readyState: 1,
    OPEN: 1,
    sentMessages: [],
    send(data: string | Uint8Array) {
      if (typeof data === "string") {
        this.sentMessages.push(data);
      }
    }
  };
}

describe("Screen Command Broadcasting", () => {
  let mockScreenClients: Set<MockWebSocket>;

  beforeEach(() => {
    mockScreenClients = new Set();
  });

  function broadcastScreenCommand(cmd: ParsedCommand): void {
    if (mockScreenClients.size === 0) return;
    const message = JSON.stringify(cmd);
    for (const ws of mockScreenClients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  }

  it("broadcasts rect command to screen clients", () => {
    const ws = createMockWs();
    mockScreenClients.add(ws);

    const cmd: RectCommand = {
      type: "rect",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      color: { r: 255, g: 0, b: 0 }
    };

    broadcastScreenCommand(cmd);

    expect(ws.sentMessages.length).toBe(1);
    const received = JSON.parse(ws.sentMessages[0]);
    expect(received.type).toBe("rect");
    expect(received.x).toBe(10);
    expect(received.y).toBe(20);
    expect(received.width).toBe(100);
    expect(received.height).toBe(50);
    expect(received.color).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("broadcasts text command to screen clients", () => {
    const ws = createMockWs();
    mockScreenClients.add(ws);

    const cmd: TextCommand = {
      type: "text",
      char: "A",
      charCode: 65,
      x: 0,
      y: 0,
      fg: { r: 255, g: 255, b: 255 },
      bg: { r: 0, g: 0, b: 0 }
    };

    broadcastScreenCommand(cmd);

    expect(ws.sentMessages.length).toBe(1);
    const received = JSON.parse(ws.sentMessages[0]);
    expect(received.type).toBe("text");
    expect(received.charCode).toBe(65);
    expect(received.fg).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("broadcasts wave command to screen clients", () => {
    const ws = createMockWs();
    mockScreenClients.add(ws);

    const cmd: WaveCommand = {
      type: "wave",
      color: { r: 0, g: 255, b: 0 },
      data: new Uint8Array([10, 20, 15, 25, 12])
    };

    broadcastScreenCommand(cmd);

    expect(ws.sentMessages.length).toBe(1);
    const received = JSON.parse(ws.sentMessages[0]);
    expect(received.type).toBe("wave");
    expect(received.color).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("broadcasts system command to screen clients", () => {
    const ws = createMockWs();
    mockScreenClients.add(ws);

    const cmd: SystemCommand = {
      type: "system",
      hardwareType: 2,
      firmwareMajor: 3,
      firmwareMinor: 1,
      firmwarePatch: 0,
      fontMode: 1
    };

    broadcastScreenCommand(cmd);

    expect(ws.sentMessages.length).toBe(1);
    const received = JSON.parse(ws.sentMessages[0]);
    expect(received.type).toBe("system");
    expect(received.fontMode).toBe(1);
  });

  it("broadcasts to multiple clients", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const ws3 = createMockWs();
    mockScreenClients.add(ws1);
    mockScreenClients.add(ws2);
    mockScreenClients.add(ws3);

    const cmd: RectCommand = {
      type: "rect",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      color: { r: 0, g: 0, b: 0 }
    };

    broadcastScreenCommand(cmd);

    expect(ws1.sentMessages.length).toBe(1);
    expect(ws2.sentMessages.length).toBe(1);
    expect(ws3.sentMessages.length).toBe(1);
  });

  it("skips closed clients", () => {
    const openWs = createMockWs();
    const closedWs = createMockWs();
    closedWs.readyState = 3; // CLOSED

    mockScreenClients.add(openWs);
    mockScreenClients.add(closedWs);

    const cmd: RectCommand = {
      type: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      color: { r: 0, g: 0, b: 0 }
    };

    broadcastScreenCommand(cmd);

    expect(openWs.sentMessages.length).toBe(1);
    expect(closedWs.sentMessages.length).toBe(0);
  });

  it("handles no clients gracefully", () => {
    const cmd: RectCommand = {
      type: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      color: { r: 0, g: 0, b: 0 }
    };

    // Should not throw
    expect(() => broadcastScreenCommand(cmd)).not.toThrow();
  });
});

describe("M8 Command Types", () => {
  it("rect command has required fields", () => {
    const cmd: RectCommand = {
      type: "rect",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      color: { r: 0, g: 0, b: 0 }
    };

    expect(cmd.type).toBe("rect");
    expect(typeof cmd.x).toBe("number");
    expect(typeof cmd.y).toBe("number");
    expect(typeof cmd.width).toBe("number");
    expect(typeof cmd.height).toBe("number");
    expect(cmd.color).toHaveProperty("r");
    expect(cmd.color).toHaveProperty("g");
    expect(cmd.color).toHaveProperty("b");
  });

  it("text command has required fields", () => {
    const cmd: TextCommand = {
      type: "text",
      char: "M",
      charCode: 77,
      x: 10,
      y: 20,
      fg: { r: 255, g: 255, b: 255 },
      bg: { r: 0, g: 0, b: 0 }
    };

    expect(cmd.type).toBe("text");
    expect(typeof cmd.charCode).toBe("number");
    expect(cmd.charCode).toBeGreaterThanOrEqual(32);
    expect(cmd.charCode).toBeLessThan(127);
    expect(cmd.fg).toHaveProperty("r");
    expect(cmd.bg).toHaveProperty("r");
  });

  it("wave command has waveform data", () => {
    const cmd: WaveCommand = {
      type: "wave",
      color: { r: 0, g: 255, b: 0 },
      data: new Uint8Array([10, 20, 15, 25, 12, 8, 30, 22])
    };

    expect(cmd.type).toBe("wave");
    expect(cmd.data.length).toBeGreaterThan(0);
    expect(cmd.data.length).toBeLessThanOrEqual(320);
  });

  it("system command has firmware info", () => {
    const cmd: SystemCommand = {
      type: "system",
      hardwareType: 2,
      firmwareMajor: 3,
      firmwareMinor: 1,
      firmwarePatch: 0,
      fontMode: 0
    };

    expect(cmd.type).toBe("system");
    expect(cmd.fontMode).toBeGreaterThanOrEqual(0);
    expect(cmd.fontMode).toBeLessThan(5);
  });
});

describe("Command JSON Serialization", () => {
  it("serializes rect command correctly", () => {
    const cmd: RectCommand = {
      type: "rect",
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      color: { r: 128, g: 64, b: 32 }
    };

    const json = JSON.stringify(cmd);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe("rect");
    expect(parsed.x).toBe(100);
    expect(parsed.color.r).toBe(128);
  });

  it("serializes text command correctly", () => {
    const cmd: TextCommand = {
      type: "text",
      char: "8",
      charCode: 56,
      x: 0,
      y: 0,
      fg: { r: 0, g: 255, b: 0 },
      bg: { r: 0, g: 0, b: 0 }
    };

    const json = JSON.stringify(cmd);
    const parsed = JSON.parse(json);

    expect(parsed.charCode).toBe(56);
    expect(parsed.fg.g).toBe(255);
  });

  it("handles Uint8Array in wave command", () => {
    const cmd: WaveCommand = {
      type: "wave",
      color: { r: 255, g: 255, b: 255 },
      data: new Uint8Array([1, 2, 3, 4, 5])
    };

    const json = JSON.stringify(cmd);
    const parsed = JSON.parse(json);

    // Uint8Array serializes as object with numeric keys
    expect(parsed.data).toBeDefined();
  });
});

describe("Bandwidth Comparison", () => {
  it("commands are much smaller than BMP", () => {
    // Typical M8 frame: ~300 characters rendered
    const commands: ParsedCommand[] = [];

    // Background rect
    commands.push({
      type: "rect",
      x: 0, y: 0, width: 320, height: 240,
      color: { r: 0, g: 0, b: 0 }
    });

    // 300 text characters
    for (let i = 0; i < 300; i++) {
      commands.push({
        type: "text",
        char: "A",
        charCode: 65,
        x: (i % 40) * 8,
        y: Math.floor(i / 40) * 10,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 }
      });
    }

    const commandsJson = commands.map(c => JSON.stringify(c)).join("");
    const commandsBytes = new TextEncoder().encode(commandsJson).length;

    // BMP: 320x240x3 + 54 header = 230,454 bytes
    const bmpBytes = 320 * 240 * 3 + 54;

    // Commands should be ~10-20x smaller for a typical frame
    expect(commandsBytes).toBeLessThan(bmpBytes / 5);
  });
});
