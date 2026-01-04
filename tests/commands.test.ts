/**
 * M8 Command Parser Tests
 * TDD: Tests first, then implementation
 */

import { describe, it, expect } from "bun:test";
import { parseCommand } from "../src/serial/commands";
import { M8Command } from "../src/state/types";

describe("M8 Command Parser", () => {
  describe("TEXT command (0xFD)", () => {
    it("should parse TEXT command correctly", () => {
      // 0xFD, char='A'(65), x=16, y=20, fg=(255,255,255), bg=(0,0,0)
      const frame = new Uint8Array([
        M8Command.TEXT,
        65, // 'A'
        16, 0, // x = 16 (little endian)
        20, 0, // y = 20
        255, 255, 255, // fg = white
        0, 0, 0, // bg = black
      ]);

      const cmd = parseCommand(frame);

      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("text");
      if (cmd!.type === "text") {
        expect(cmd.char).toBe("A");
        expect(cmd.charCode).toBe(65);
        expect(cmd.x).toBe(16);
        expect(cmd.y).toBe(20);
        expect(cmd.fg).toEqual({ r: 255, g: 255, b: 255 });
        expect(cmd.bg).toEqual({ r: 0, g: 0, b: 0 });
      }
    });

    it("should handle non-printable characters", () => {
      const frame = new Uint8Array([
        M8Command.TEXT,
        0, // null char
        0, 0,
        0, 0,
        255, 255, 255,
        0, 0, 0,
      ]);

      const cmd = parseCommand(frame);

      expect(cmd).not.toBeNull();
      if (cmd!.type === "text") {
        expect(cmd.char).toBe(" "); // should be space for non-printable
        expect(cmd.charCode).toBe(0);
      }
    });

    it("should reject short TEXT frame", () => {
      const frame = new Uint8Array([M8Command.TEXT, 65, 0, 0]); // too short
      const cmd = parseCommand(frame);
      expect(cmd).toBeNull();
    });
  });

  describe("RECT command (0xFE)", () => {
    it("should parse full RECT command (12 bytes)", () => {
      const frame = new Uint8Array([
        M8Command.RECT,
        10, 0, // x = 10
        20, 0, // y = 20
        100, 0, // width = 100
        50, 0, // height = 50
        255, 0, 0, // color = red
      ]);

      const cmd = parseCommand(frame);

      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("rect");
      if (cmd!.type === "rect") {
        expect(cmd.x).toBe(10);
        expect(cmd.y).toBe(20);
        expect(cmd.width).toBe(100);
        expect(cmd.height).toBe(50);
        expect(cmd.color).toEqual({ r: 255, g: 0, b: 0 });
      }
    });

    it("should parse minimal RECT command (5 bytes)", () => {
      const frame = new Uint8Array([
        M8Command.RECT,
        10, 0, // x = 10
        20, 0, // y = 20
      ]);

      const cmd = parseCommand(frame);

      expect(cmd).not.toBeNull();
      if (cmd!.type === "rect") {
        expect(cmd.x).toBe(10);
        expect(cmd.y).toBe(20);
        expect(cmd.width).toBe(1);
        expect(cmd.height).toBe(1);
      }
    });
  });

  describe("WAVE command (0xFC)", () => {
    it("should parse WAVE command", () => {
      const waveData = new Uint8Array(10).fill(128);
      const frame = new Uint8Array([
        M8Command.WAVE,
        0, 255, 0, // color = green
        ...waveData,
      ]);

      const cmd = parseCommand(frame);

      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("wave");
      if (cmd!.type === "wave") {
        expect(cmd.color).toEqual({ r: 0, g: 255, b: 0 });
        expect(cmd.data.length).toBe(10);
      }
    });
  });

  describe("SYSTEM command (0xFF)", () => {
    it("should parse SYSTEM command", () => {
      const frame = new Uint8Array([
        M8Command.SYSTEM,
        2, // hardware type = Production
        3, // firmware major
        1, // firmware minor
        5, // firmware patch
        0, // font mode
      ]);

      const cmd = parseCommand(frame);

      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("system");
      if (cmd!.type === "system") {
        expect(cmd.hardwareType).toBe(2);
        expect(cmd.firmwareMajor).toBe(3);
        expect(cmd.firmwareMinor).toBe(1);
        expect(cmd.firmwarePatch).toBe(5);
        expect(cmd.fontMode).toBe(0);
      }
    });
  });

  describe("JPAD command (0xFB)", () => {
    it("should parse JPAD command", () => {
      const frame = new Uint8Array([
        M8Command.JPAD,
        0x42, 0x00, // state = 0x0042
      ]);

      const cmd = parseCommand(frame);

      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("jpad");
      if (cmd!.type === "jpad") {
        expect(cmd.state).toBe(0x42);
      }
    });
  });

  describe("Unknown commands", () => {
    it("should return null for unknown command", () => {
      const frame = new Uint8Array([0x00, 0x01, 0x02]);
      const cmd = parseCommand(frame);
      expect(cmd).toBeNull();
    });

    it("should return null for empty frame", () => {
      const frame = new Uint8Array([]);
      const cmd = parseCommand(frame);
      expect(cmd).toBeNull();
    });
  });
});
