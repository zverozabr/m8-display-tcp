/**
 * Display Delta Tests
 * TDD: Tests for command deduplication to reduce TCP traffic
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { DisplayDelta } from "../../src/display/delta";
import type { TextCommand, RectCommand, WaveCommand } from "../../src/state/types";

describe("DisplayDelta", () => {
  let delta: DisplayDelta;

  beforeEach(() => {
    delta = new DisplayDelta();
  });

  describe("TEXT command deduplication", () => {
    it("should send first TEXT command", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      expect(delta.shouldSend(cmd)).toBe(true);
    });

    it("should skip duplicate TEXT command", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      expect(delta.shouldSend(cmd)).toBe(true); // first time
      expect(delta.shouldSend(cmd)).toBe(false); // duplicate
    });

    it("should send changed TEXT character", () => {
      const cmdA: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };
      const cmdB: TextCommand = {
        type: "text",
        char: "B",
        charCode: 66,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      delta.shouldSend(cmdA);
      expect(delta.shouldSend(cmdB)).toBe(true);
    });

    it("should send changed TEXT fg color", () => {
      const white: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };
      const cyan: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 0, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      delta.shouldSend(white);
      expect(delta.shouldSend(cyan)).toBe(true);
    });

    it("should send changed TEXT bg color", () => {
      const black: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };
      const gray: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 96, g: 96, b: 96 },
      };

      delta.shouldSend(black);
      expect(delta.shouldSend(gray)).toBe(true);
    });

    it("should track different positions independently", () => {
      const cmdPos1: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };
      const cmdPos2: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 10,
        y: 20,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      expect(delta.shouldSend(cmdPos1)).toBe(true);
      expect(delta.shouldSend(cmdPos2)).toBe(true); // different position
      expect(delta.shouldSend(cmdPos1)).toBe(false); // duplicate pos1
      expect(delta.shouldSend(cmdPos2)).toBe(false); // duplicate pos2
    });
  });

  describe("RECT command deduplication", () => {
    it("should send first RECT command", () => {
      const cmd: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: { r: 255, g: 0, b: 0 },
      };

      expect(delta.shouldSend(cmd)).toBe(true);
    });

    it("should skip duplicate RECT command", () => {
      const cmd: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: { r: 255, g: 0, b: 0 },
      };

      expect(delta.shouldSend(cmd)).toBe(true);
      expect(delta.shouldSend(cmd)).toBe(false);
    });

    it("should send changed RECT color", () => {
      const red: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: { r: 255, g: 0, b: 0 },
      };
      const green: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: { r: 0, g: 255, b: 0 },
      };

      delta.shouldSend(red);
      expect(delta.shouldSend(green)).toBe(true);
    });

    it("should send changed RECT size", () => {
      const small: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: { r: 255, g: 0, b: 0 },
      };
      const large: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        color: { r: 255, g: 0, b: 0 },
      };

      delta.shouldSend(small);
      expect(delta.shouldSend(large)).toBe(true);
    });
  });

  describe("WAVE command (always send)", () => {
    it("should always send WAVE commands", () => {
      const cmd: WaveCommand = {
        type: "wave",
        color: { r: 0, g: 255, b: 0 },
        data: new Uint8Array([128, 128, 128]),
      };

      expect(delta.shouldSend(cmd)).toBe(true);
      expect(delta.shouldSend(cmd)).toBe(true); // always send wave
    });
  });

  describe("reset()", () => {
    it("should clear state on reset", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      delta.shouldSend(cmd);
      expect(delta.shouldSend(cmd)).toBe(false); // duplicate

      delta.reset();
      expect(delta.shouldSend(cmd)).toBe(true); // after reset
    });

    it("should reset on large RECT (screen clear)", () => {
      const text: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };
      const screenClear: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 320, // full screen width
        height: 240, // full screen height
        color: { r: 0, g: 0, b: 0 },
      };

      delta.shouldSend(text);
      expect(delta.shouldSend(text)).toBe(false); // duplicate

      delta.shouldSend(screenClear); // should trigger reset
      expect(delta.shouldSend(text)).toBe(true); // after screen clear
    });
  });

  describe("statistics", () => {
    it("should track sent and skipped counts", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      delta.shouldSend(cmd); // sent
      delta.shouldSend(cmd); // skipped
      delta.shouldSend(cmd); // skipped

      const stats = delta.getStats();
      expect(stats.sent).toBe(1);
      expect(stats.skipped).toBe(2);
      expect(stats.ratio).toBeCloseTo(0.333, 2);
    });

    it("should reset statistics", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      delta.shouldSend(cmd);
      delta.shouldSend(cmd);

      delta.resetStats();
      const stats = delta.getStats();
      expect(stats.sent).toBe(0);
      expect(stats.skipped).toBe(0);
    });
  });
});
